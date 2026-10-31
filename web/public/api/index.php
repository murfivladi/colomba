<?php
/**
 * Colomba — PHP-прокси API на shared-хостинге.
 *
 * Браузер обращается только к vladinc.ru/colomba/api/…, а этот скрипт пересылает запрос
 * на бэкенд (https://colomba-api.vladinc.ru:5576/api/…): метод, тело (в том числе загрузку
 * фото и голоса), cookie сессии; ответ — статус, заголовки и тело потоком, так что
 * поток уведомлений (SSE) и файлы идут без буферизации.
 *
 * Настройки — в config.php рядом (его создаёт деплой, в репозитории его нет):
 *   return ['backends' => ['https://colomba-api.vladinc.ru', 'https://colomba-api.vladinc.ru:5576'], 'secret' => '…'];
 * Адреса пробуются по порядку (многие хостинги выпускают наружу только порты 80/443);
 * рабочий запоминается на 10 минут. Диагностика: /colomba/api/__diag?key=<secret>.
 * secret — общий ключ с бэкендом (PROXY_SECRET): без него бэкенд не принимает запросы,
 * то есть к API нельзя обратиться в обход прокси.
 */

declare(strict_types=1);

$cfgFile = __DIR__ . '/config.php';
$cfg = is_file($cfgFile) ? (require $cfgFile) : [];
$backends = $cfg['backends'] ?? [$cfg['backend'] ?? (getenv('COLOMBA_BACKEND') ?: 'https://colomba-api.vladinc.ru')];
$backends = array_values(array_unique(array_map(fn($b) => rtrim((string)$b, '/'), (array)$backends)));
$secret = (string)($cfg['secret'] ?? getenv('COLOMBA_PROXY_SECRET') ?: '');

function fail(int $code, string $error): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['error' => $error]);
    exit;
}

// ── путь после /api ──
$uri = (string)($_SERVER['REQUEST_URI'] ?? '/');
$qPos = strpos($uri, '?');
$path = $qPos === false ? $uri : substr($uri, 0, $qPos);
$query = $qPos === false ? '' : substr($uri, $qPos);
// всё после первого сегмента /api (…/colomba/api/auth/login → /auth/login); не зависит от SCRIPT_NAME,
// который у разных хостингов и режимов PHP выглядит по-разному
$sub = preg_match('#^.*?/api(/.*)?$#', $path, $m) ? ($m[1] ?? '/') : '/';
if ($sub === '' || $sub === '/index.php') $sub = '/';

// ── диагностика связи хостинг → бэкенд (только с секретом) ──
if ($sub === '/__diag') {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    if ($secret === '' || !hash_equals($secret, (string)($_GET['key'] ?? ''))) fail(403, 'forbidden');
    $cv = curl_version();
    $out = ['php' => PHP_VERSION, 'curl' => $cv['version'] ?? null, 'ssl' => $cv['ssl_version'] ?? null,
        'post_data_reading' => ini_get('enable_post_data_reading'), 'backends' => []];
    foreach ($backends as $b) {
        $u = parse_url($b);
        $host = (string)($u['host'] ?? '');
        $port = (int)($u['port'] ?? 443);
        $ip = filter_var($host, FILTER_VALIDATE_IP) ? $host : gethostbyname($host);
        $t = microtime(true);
        $sock = @fsockopen($ip, $port, $errno, $errstr, 5);
        $tcp = $sock ? 'ok' : "fail: $errstr ($errno)";
        if ($sock) fclose($sock);
        $tcpMs = (int)((microtime(true) - $t) * 1000);
        $ch = curl_init($b . '/api/health');
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 10]);
        $body = curl_exec($ch);
        $out['backends'][] = [
            'url' => $b, 'dns' => ($ip === $host && !filter_var($host, FILTER_VALIDATE_IP)) ? 'fail' : $ip, 'tcp' => $tcp, 'tcp_ms' => $tcpMs,
            'http' => curl_getinfo($ch, CURLINFO_RESPONSE_CODE), 'curl_error' => curl_error($ch) ?: null,
            'body' => is_string($body) ? substr($body, 0, 120) : null,
        ];
        curl_close($ch);
    }
    echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

// никаких выходов за пределы /api и мусорных символов
if (strpos($sub, '..') !== false || preg_match('#[^A-Za-z0-9/_\-.]#', $sub)) fail(400, 'bad_path');
// рабочий адрес бэкенда запоминается, чтобы не ждать таймаута на заблокированном
$cacheFile = rtrim(sys_get_temp_dir(), '/') . '/colomba-backend-' . md5(implode('|', $backends));
$good = @file_get_contents($cacheFile);
if ($good !== false && in_array($good, $backends, true) && @filemtime($cacheFile) > time() - 600) {
    $backends = array_values(array_unique(array_merge([$good], $backends)));
}

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if (!in_array($method, ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], true)) fail(405, 'method_not_allowed');
$isStream = $sub === '/me/stream';

// ── заголовки запроса ──
$headers = [];
$pass = [
    'CONTENT_TYPE' => 'Content-Type', 'HTTP_ACCEPT' => 'Accept', 'HTTP_ACCEPT_LANGUAGE' => 'Accept-Language',
    'HTTP_USER_AGENT' => 'User-Agent', 'HTTP_COOKIE' => 'Cookie', 'HTTP_LAST_EVENT_ID' => 'Last-Event-ID',
    'HTTP_RANGE' => 'Range', 'HTTP_IF_NONE_MATCH' => 'If-None-Match', 'HTTP_IF_MODIFIED_SINCE' => 'If-Modified-Since',
];
foreach ($pass as $k => $name) {
    if (isset($_SERVER[$k]) && $_SERVER[$k] !== '') $headers[] = $name . ': ' . $_SERVER[$k];
}
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
$headers[] = 'X-Forwarded-For: ' . $ip;
$headers[] = 'X-Forwarded-Proto: https';
$headers[] = 'X-Forwarded-Host: ' . (string)($_SERVER['HTTP_HOST'] ?? '');
if ($secret !== '') $headers[] = 'X-Colomba-Proxy: ' . $secret;
$headers[] = 'Expect:';

// ── тело запроса ──
$body = null;
if (!in_array($method, ['GET', 'HEAD'], true)) {
    $body = file_get_contents('php://input');
    $ctype = (string)($_SERVER['CONTENT_TYPE'] ?? '');
    // если хостинг уже разобрал multipart (enable_post_data_reading = On), собираем его заново
    if (($body === '' || $body === false) && stripos($ctype, 'multipart/form-data') === 0) {
        $fields = [];
        foreach ($_POST as $k => $v) $fields[$k] = (string)$v;
        foreach ($_FILES as $k => $f) {
            if (is_array($f['tmp_name'])) continue;
            if ($f['error'] !== UPLOAD_ERR_OK) fail(400, 'upload_failed');
            $fields[$k] = new CURLFile($f['tmp_name'], (string)$f['type'], (string)$f['name']);
        }
        $body = $fields;
        // curl сам поставит Content-Type с новой границей
        $headers = array_values(array_filter($headers, fn($h) => stripos($h, 'Content-Type:') !== 0));
    }
}

// ── ответ потоком ──
if ($isStream) {
    // отключение браузера замечаем на ближайшей записи (бэкенд шлёт пинг каждые 15 с)
    ignore_user_abort(true);
    @set_time_limit(0);
    @ini_set('zlib.output_compression', '0');
    @ini_set('output_buffering', '0');
    @ini_set('implicit_flush', '1');
    if (function_exists('apache_setenv')) @apache_setenv('no-gzip', '1');
} else {
    @set_time_limit(120);
}
while (ob_get_level() > 0) ob_end_flush();

$sentHeaders = false;
$status = 502;
$respHeaders = [];
$skip = ['transfer-encoding', 'connection', 'keep-alive', 'content-length', 'content-encoding', 'strict-transport-security',
    'access-control-allow-origin', 'access-control-allow-credentials', 'access-control-allow-methods',
    'access-control-allow-headers', 'access-control-max-age', 'vary', 'date', 'server'];

$emitHeaders = function () use (&$sentHeaders, &$status, &$respHeaders, $isStream): void {
    if ($sentHeaders) return;
    $sentHeaders = true;
    http_response_code($status);
    foreach ($respHeaders as $h) header($h, false);
    if ($isStream) {
        header('X-Accel-Buffering: no');
        header('Cache-Control: no-cache, no-transform');
    }
};

$errors = [];
$done = false;
foreach ($backends as $backend) {
    $ch = curl_init($backend . '/api' . $sub . $query);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_NOBODY => $method === 'HEAD',
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => count($backends) > 1 ? 4 : 10,
        CURLOPT_TIMEOUT => $isStream ? 0 : 110,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_ENCODING => '',
        CURLOPT_HEADERFUNCTION => function ($ch, string $line) use (&$status, &$respHeaders, $skip): int {
            $len = strlen($line);
            $t = trim($line);
            if ($t === '') return $len;
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $t, $m)) {
                // новый статус (например, после 100 Continue) — заголовки заново
                $status = (int)$m[1];
                $respHeaders = [];
                return $len;
            }
            $p = strpos($t, ':');
            if ($p === false) return $len;
            $name = strtolower(trim(substr($t, 0, $p)));
            if (in_array($name, $skip, true)) return $len;
            if ($name === 'set-cookie') {
                // cookie сессии — для домена сайта, без привязки к домену бэкенда
                $t = preg_replace('#;\s*Domain=[^;]*#i', '', $t);
            }
            $respHeaders[] = $t;
            return $len;
        },
        CURLOPT_WRITEFUNCTION => function ($ch, string $chunk) use ($emitHeaders): int {
            $emitHeaders();
            echo $chunk;
            flush();
            // браузер закрыл вкладку — прекращаем пересылку
            return connection_aborted() ? 0 : strlen($chunk);
        },
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);

    $ok = curl_exec($ch);
    $errno = curl_errno($ch);
    $errText = curl_error($ch);
    curl_close($ch);
    if ($ok !== false || $sentHeaders) {
        if ($ok !== false) @file_put_contents($cacheFile, $backend);
        $emitHeaders();
        $done = true;
        break;
    }
    // не удалось подключиться — пробуем следующий адрес (тело ещё не отправлено)
    $errors[] = $backend . ': ' . $errText;
    error_log('colomba proxy: ' . $backend . ' — ' . $errText . " ($errno)");
}
if (!$done) {
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['error' => 'backend_unavailable', 'tried' => count($backends)]);
}

