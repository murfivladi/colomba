import { createContext, useContext } from 'react';
import type { Lang } from '@colomba/shared';

/** Интерфейс на русском и итальянском. */
const ru = {
  'app.tagline': 'Медленные письма. Каждое несёт курьер.',
  'nav.station': 'Станция', 'nav.mailbox': 'Почта', 'nav.write': 'Написать', 'nav.friends': 'Друзья', 'nav.more': 'Ещё',
  'common.save': 'Сохранить', 'common.cancel': 'Отмена', 'common.close': 'Закрыть', 'common.back': 'Назад', 'common.next': 'Далее',
  'common.delete': 'Удалить', 'common.loading': 'Загрузка…', 'common.error': 'Что-то пошло не так', 'common.yes': 'Да', 'common.no': 'Нет',
  'common.semi': 'зёрнышек', 'common.km': 'км', 'common.saved': 'Сохранено', 'common.copy': 'Копировать', 'common.copied': 'Скопировано',
  'common.search': 'Поиск', 'common.or': 'или', 'common.send': 'Отправить', 'common.edit': 'Изменить', 'common.done': 'Готово',
  'auth.login': 'Вход', 'auth.register': 'Регистрация', 'auth.email': 'Почта', 'auth.password': 'Пароль', 'auth.username': 'Имя пользователя (@ник)',
  'auth.displayName': 'Как вас зовут', 'auth.birthDate': 'Дата рождения', 'auth.invite': 'Код приглашения', 'auth.lang': 'Язык',
  'auth.terms': 'Я принимаю правила и политику конфиденциальности', 'auth.withPassword': 'Войти по паролю',
  'auth.withCode': 'Войти по коду на почту', 'auth.sendCode': 'Прислать код', 'auth.code': 'Код из письма', 'auth.codeSent': 'Код отправлен — проверьте почту.',
  'auth.withPasskey': 'Войти с ключом доступа (passkey)', 'auth.childDevice': 'Я ребёнок: у меня есть код от родителя', 'auth.childCode': 'Код от родителя',
  'auth.noAccount': 'Нет аккаунта?', 'auth.haveAccount': 'Уже есть аккаунт?', 'auth.under14': 'Детям до 14 лет профиль создаёт родитель в своём аккаунте.',
  'auth.inviteOnly': 'Сейчас идёт закрытая бета — нужна ссылка-приглашение от друга.', 'auth.logout': 'Выйти',
  'onb.title': 'Добро пожаловать на почтовую станцию', 'onb.location': 'Где вы находитесь?',
  'onb.locationWhy': 'Курьеру нужно знать, откуда лететь. Точные координаты хранятся только на сервере и никому не показываются: другие видят город, страну или только расстояние — как вы решите.',
  'onb.allowLocation': 'Разрешить геолокацию', 'onb.locationOk': 'Место определено', 'onb.install': 'Установите Colomba на экран',
  'onb.installIos': 'На iPhone: «Поделиться» → «На экран „Домой“». Без этого уведомления о прилёте не придут (iOS 16.4+).',
  'onb.installBtn': 'Установить', 'onb.notify': 'Уведомления', 'onb.notifyWhy': 'Курьер даст знать, когда прилетит письмо.',
  'onb.allowNotify': 'Включить уведомления', 'onb.start': 'На станцию!',
  'station.title': 'Почтовая станция', 'station.dovecote': 'Голубятня', 'station.stable': 'Конюшня', 'station.pier': 'Причал', 'station.mailbox': 'Почтовый ящик',
  'station.empty': 'Курьеры в пути', 'station.inFlight': 'В пути', 'station.slots': 'Слоты', 'station.buySlot': 'Новый слот', 'station.catalog': 'Каталог курьеров',
  'courier.status.home': 'дома', 'courier.status.outbound': 'несёт письмо', 'courier.status.waiting': 'ждёт ответа', 'courier.status.returning': 'летит домой',
  'courier.trips': 'рейсов', 'courier.rename': 'Дать имя', 'courier.release': 'Отпустить', 'courier.speed': 'Скорость', 'courier.capacity': 'Что несёт',
  'courier.night': 'Ночью', 'courier.route': 'Маршрут', 'courier.back': 'Вернётся', 'courier.waitUntil': 'Ждёт до', 'courier.flight': 'Смотреть полёт',
  'courier.experience': 'Опыт: +{n}% к скорости',
  'night.rest': 'отдыхает', 'night.night_only': 'летит только ночью', 'night.always': 'идёт круглосуточно', 'night.sea_only': 'над морем летит, на суше отдыхает', 'night.hours': 'по расписанию',
  'route.air': 'по воздуху, облетает горы', 'route.air_sea': 'по воздуху, предпочитает море', 'route.air_direct': 'по воздуху напрямую',
  'route.land': 'по дорогам', 'route.land_sea': 'по суше и морю', 'route.sea': 'морем', 'route.post': 'дороги и авиа',
  'cap.text': 'до {n} знаков', 'cap.photos': '{n} фото', 'cap.drawings': 'рисунок', 'cap.voice': 'голос до {n} мин', 'cap.or': '1 фото или рисунок', 'cap.textOnly': 'только текст',
  'section.birds': 'Птицы', 'section.animals': 'Животные', 'section.history': 'История', 'section.post': 'Почта',
  'catalog.title': 'Каталог курьеров', 'catalog.owned': 'у вас', 'catalog.get': 'Забрать', 'catalog.buy': 'Купить за {n}', 'catalog.locked': 'Задание',
  'catalog.outOfSeason': 'Не сезон', 'catalog.season': 'Сезонный: {m}',
  'quest.ocean_letter': 'Отправить первое письмо через океан', 'quest.night_letter': 'Отправить письмо ночью',
  'quest.distance_5000': 'Письма прошли 5 000 км', 'quest.letters_5': 'Отправить 5 писем', 'quest.long_correspondence': 'Переписка из 10 писем с одним человеком',
  'mailbox.title': 'Почтовый ящик', 'mailbox.incoming': 'Летят к вам', 'mailbox.arrives': 'прибудет {t}', 'mailbox.empty': 'Пока пусто. Курьеры не спешат — и это прекрасно.',
  'mailbox.requests': 'Прилетели голуби с заявками', 'mailbox.accept': 'Дружить', 'mailbox.decline': 'Отклонить', 'mailbox.outbox': 'Отправленные в пути',
  'mailbox.conversations': 'Переписки', 'mailbox.box': 'Шкатулка', 'mailbox.drafts': 'Черновики',
  'letter.from': 'От', 'letter.to': 'Кому', 'letter.open': 'Вскрыть', 'letter.reply': 'Ответить', 'letter.replyWith': 'Ответить с курьером «{name}»',
  'letter.postcard': 'Открытка', 'letter.quick1': 'Получил, отвечу позже!', 'letter.quick2': 'Спасибо за письмо!', 'letter.quick3': 'Обнимаю!',
  'letter.report': 'Пожаловаться', 'letter.block': 'Заблокировать', 'letter.postmarks': 'Штемпели', 'letter.read': 'Прочитано',
  'letter.delivered': 'Доставлено', 'letter.inTransit': 'В пути', 'letter.lost': 'Курьер задерживается', 'letter.recall': 'Вернуть курьера',
  'letter.recallUntil': 'Можно вернуть до {t}', 'letter.removed': 'Письмо удалено модератором', 'letter.bottleFrom': 'Записка в бутылке',
  'letter.someone': 'Кто-то выловит', 'letter.scheduled': 'Вылет по расписанию: {t}', 'letter.queued': 'Ждёт возвращения курьера',
  'compose.title': 'Новое письмо', 'compose.to': 'Адресат', 'compose.chooseFriend': 'Выберите друга', 'compose.courier': 'Курьер', 'compose.paper': 'Бумага и шрифт',
  'compose.content': 'Письмо', 'compose.when': 'Когда отправить', 'compose.text': 'Текст', 'compose.photo': 'Фото', 'compose.voice': 'Голос', 'compose.drawing': 'Рисунок',
  'compose.record': 'Записать', 'compose.stop': 'Стоп', 'compose.clear': 'Очистить', 'compose.addDrawing': 'Добавить рисунок', 'compose.handwrite': 'Писать от руки',
  'compose.now': 'Сейчас', 'compose.schedule': 'В указанное время', 'compose.arriveBy': 'Чтобы пришло к дате', 'compose.queue': 'Когда курьер вернётся',
  'compose.surprise': 'Сюрприз — не предупреждать получателя', 'compose.travel': 'В пути: {d}', 'compose.arrive': 'Прибытие: {t}', 'compose.distance': '{n} км',
  'compose.fits': 'Вместит: {cap}', 'compose.over': 'Не помещается: {what}', 'compose.draftSaved': 'Черновик сохранён', 'compose.sent': 'Курьер вылетел!',
  'compose.confirmSlow': 'Курьер будет идти {d}. Это честный срок — отправить?', 'compose.noRoute': 'У этого курьера нет пути такого типа к адресату',
  'compose.stamp': 'Марка', 'compose.stickers': 'Наклейки', 'compose.font': 'Шрифт', 'compose.bottle': 'Бутылка в море — без адресата',
  'compose.bottleHint': 'Записку выловит случайный взрослый пользователь, и может начаться переписка.', 'compose.tariff': 'Тариф',
  'compose.multi': 'Рассылка нескольким', 'compose.addRecipient': 'Добавить адресата', 'compose.pickCourier': 'Подходящие курьеры',
  'compose.releaseAt': 'Время вылета', 'compose.arriveByDate': 'Дата прибытия', 'compose.scheduled': 'Курьер вылетит {t}',
  'compose.queued': 'Письмо в очереди — курьер вылетит, как только вернётся', 'compose.chars': '{n} / {max}',
  'compose.reply': 'Ответ тем же курьером', 'compose.warnFarSea': 'Адресат далеко от моря — до берега письмо понесёт местный гонец',
  'flight.title': 'Полёт', 'flight.onlySender': 'Карту полёта видите только вы.', 'flight.events': 'Журнал пути', 'flight.eta': 'Прибытие {t}',
  'flight.left': 'осталось {d}', 'flight.resting': 'отдыхает', 'flight.moving': 'в пути', 'flight.arrived': 'на месте',
  'friends.title': 'Друзья', 'friends.add': 'Добавить друга', 'friends.byNick': 'По @нику', 'friends.qr': 'QR-код и ссылка', 'friends.contacts': 'Из контактов',
  'friends.penpals': 'Друзья по переписке', 'friends.bottle': 'Бутылка в море', 'friends.request': 'Позвать в друзья', 'friends.requested': 'Заявка отправлена',
  'friends.pending': 'ждёт ответа', 'friends.awaiting_parent': 'ждёт одобрения родителя', 'friends.penpal': 'по переписке', 'friends.write': 'Написать',
  'friends.remove': 'Удалить из друзей', 'friends.myLink': 'Ваша ссылка-приглашение', 'friends.share': 'Поделиться', 'friends.contactsNone': 'Браузер не поддерживает выбор контактов.',
  'friends.contactsWhy': 'Мы проверим только выбранные вами адреса и ничего не сохраним.', 'friends.empty': 'Пока никого. Пригласите друга ссылкой или QR-кодом.',
  'penpal.mode.interests': 'По интересам', 'penpal.mode.language': 'Языковой обмен', 'penpal.mode.near': 'Рядом', 'penpal.mode.far': 'На другом конце света', 'penpal.mode.random': 'Случай',
  'penpal.enable': 'Меня можно найти в поиске друзей по переписке', 'penpal.connect': 'Начать переписку', 'penpal.adultsOnly': 'Поиск незнакомцев доступен только взрослым.',
  'profile.letters': 'писем', 'profile.collection': 'Коллекция курьеров', 'profile.interests': 'Интересы', 'profile.languages': 'Языки',
  'album.title': 'Альбом', 'album.postmarks': 'Штемпели', 'album.countries': 'Страны', 'album.stamps': 'Марки', 'album.achievements': 'Достижения',
  'album.couriers': 'Курьеры', 'album.empty': 'Штемпели появятся, когда письма пройдут через города.',
  'shop.title': 'Лавка', 'shop.buy': 'За {n}', 'shop.owned': 'Есть', 'shop.notNow': 'Только в праздник', 'shop.noMoney': 'Не хватает зёрнышек',
  'shop.kind.paper': 'Бумага', 'shop.kind.envelope': 'Конверты', 'shop.kind.stamp': 'Марки', 'shop.kind.sticker': 'Наклейки', 'shop.kind.tariff': 'Тарифы «Почты»',
  'semi.title': 'Зёрнышки', 'semi.hint': 'Зёрнышки только зарабатываются: за доставленные письма, ответы, долгие переписки, достижения и ежедневный вход. Реальных денег в Colomba нет.',
  'semi.daily': '+{n} зёрнышко за сегодняшний визит',
  'settings.title': 'Настройки', 'settings.profile': 'Профиль', 'settings.privacy': 'Приватность', 'settings.notifications': 'Уведомления',
  'settings.security': 'Вход и безопасность', 'settings.children': 'Детские профили', 'settings.about': 'О приложении', 'settings.danger': 'Удаление аккаунта',
  'settings.lang': 'Язык интерфейса', 'settings.bio': 'О себе', 'settings.avatar': 'Аватар', 'settings.country': 'Страна',
  'settings.locPrecision': 'Что другие видят о моём месте', 'settings.loc.city': 'Город', 'settings.loc.country': 'Страну', 'settings.loc.distance': 'Только расстояние',
  'settings.whoCanWrite': 'Кто может мне писать', 'settings.who.friends': 'Только друзья', 'settings.who.friends_penpals': 'Друзья и друзья по переписке',
  'settings.who.everyone': 'Все взрослые', 'settings.readReceipts': 'Показывать отправителю отметку «прочитано»',
  'settings.bottle': 'Я хочу вылавливать бутылки с записками', 'settings.push': 'Push-уведомления на этом устройстве', 'settings.pushOn': 'включены', 'settings.pushOff': 'выключены',
  'settings.digest': 'Ежедневная утренняя сводка вместо отдельных уведомлений о пути', 'settings.tripEvents': 'Сообщать о событиях в пути',
  'settings.sounds': 'Звуки курьеров', 'settings.animations': 'Анимации', 'settings.theme': 'Тема', 'settings.theme.auto': 'Как в системе', 'settings.theme.light': 'Светлая', 'settings.theme.dark': 'Тёмная',
  'settings.passkeys': 'Ключи доступа (passkeys)', 'settings.addPasskey': 'Добавить ключ доступа', 'settings.changePassword': 'Сменить пароль',
  'settings.currentPassword': 'Текущий пароль', 'settings.newPassword': 'Новый пароль', 'settings.export': 'Скачать мои данные',
  'settings.deleteWarn': 'Аккаунт будет удалён. Письма останутся у получателей, но автор станет анонимным. Это нельзя отменить.',
  'settings.deleteConfirm': 'Введите DELETE для подтверждения', 'settings.deleteBtn': 'Удалить аккаунт навсегда', 'settings.updateLocation': 'Обновить моё место',
  'settings.blocked': 'Заблокированные', 'settings.unblock': 'Разблокировать', 'settings.legal': 'Правила и конфиденциальность',
  'children.add': 'Создать детский профиль', 'children.consent': 'Я родитель или законный представитель и даю согласие на обработку данных ребёнка',
  'children.deviceCode': 'Код для входа на устройстве ребёнка', 'children.codeHint': 'Ребёнок вводит его на экране входа: «Я ребёнок». Код действует 24 часа.',
  'children.requests': 'Заявки в друзья, ждущие вашего одобрения', 'children.approve': 'Одобрить', 'children.wants': '{other} хочет дружить с {child}',
  'children.rules': 'В детском режиме: пишут только одобренные вами друзья; поиск незнакомцев, бутылки и контакты недоступны; место видно не точнее города.',
  'report.title': 'Жалоба', 'report.reason': 'Причина', 'report.spam': 'Спам', 'report.abuse': 'Оскорбления', 'report.inappropriate': 'Неуместное содержимое',
  'report.child_safety': 'Угроза ребёнку', 'report.other': 'Другое', 'report.comment': 'Комментарий', 'report.alsoBlock': 'Сразу заблокировать', 'report.sent': 'Жалоба отправлена. Её разберёт администратор.',
  'notif.title': 'Уведомления', 'notif.empty': 'Новостей нет — курьеры в пути.',
  'about.text': 'Colomba — хобби-проект: бесплатно, без рекламы и без реальных денег. Медленность — это удовольствие.',
  'about.attribution': 'Данные и сервисы',
  'admin.title': 'Админ-панель', 'admin.couriers': 'Курьеры и события', 'admin.reports': 'Жалобы', 'admin.stats': 'Статистика', 'admin.broadcasts': 'Рассылки',
  'admin.invites': 'Приглашения', 'admin.users': 'Пользователи', 'admin.settings': 'Настройки',
  'err.unauthorized': 'Нужно войти', 'err.invalid_credentials': 'Неверная почта или пароль', 'err.username_taken': 'Этот ник занят', 'err.email_taken': 'Эта почта уже зарегистрирована',
  'err.invite_required': 'Нужен код приглашения', 'err.invite_invalid': 'Приглашение недействительно', 'err.courier_busy': 'Курьер занят',
  'err.over_capacity': 'Письмо не помещается в грузоподъёмность курьера', 'err.no_route': 'Сушей туда не дойти — выберите птицу, корабль или почту',
  'err.no_sea_route': 'Морем туда не доплыть', 'err.tariff_needs_land': 'Наземная почта туда не ходит — нужен тариф «Авиа»', 'err.too_slow': 'Слишком долго даже для улитки',
  'err.recipient_accepts_friends_only': 'Получатель принимает письма только от друзей', 'err.child_only_approved_friends': 'Ребёнку пишут только одобренные родителем друзья',
  'err.blocked': 'Переписка заблокирована', 'err.not_enough_semi': 'Не хватает зёрнышек', 'err.no_free_slot': 'Нет свободного слота',
  'err.quest_not_completed': 'Сначала выполните задание', 'err.recall_window_passed': 'Курьер уже далеко — вернуть нельзя', 'err.no_sender_location': 'Не знаем, где вы — разрешите геолокацию',
  'err.recipient_has_no_location': 'Адресат ещё не открыл приложение — неизвестно, куда лететь', 'err.empty_letter': 'Письмо пустое',
  'err.no_one_to_catch_bottle': 'Пока некому выловить бутылку', 'err.banned': 'Аккаунт заблокирован', 'err.child_must_be_created_by_parent': 'Детям до 14 лет профиль создаёт родитель',
  'err.cannot_arrive_in_time': 'Не успеть к этой дате даже при отправке сейчас', 'err.postcard_too_long': 'Открытка — до 140 знаков без вложений',
  'err.courier_out_of_season': 'Этот курьер сейчас не в сезоне', 'err.tariff_not_owned': 'Этот тариф ещё не куплен', 'err.wrong_password': 'Неверный пароль',
};

type Dict = Record<keyof typeof ru, string>;

const it: Dict = {
  'app.tagline': 'Lettere lente. Ognuna la porta un corriere.',
  'nav.station': 'Stazione', 'nav.mailbox': 'Posta', 'nav.write': 'Scrivi', 'nav.friends': 'Amici', 'nav.more': 'Altro',
  'common.save': 'Salva', 'common.cancel': 'Annulla', 'common.close': 'Chiudi', 'common.back': 'Indietro', 'common.next': 'Avanti',
  'common.delete': 'Elimina', 'common.loading': 'Caricamento…', 'common.error': 'Qualcosa è andato storto', 'common.yes': 'Sì', 'common.no': 'No',
  'common.semi': 'semi', 'common.km': 'km', 'common.saved': 'Salvato', 'common.copy': 'Copia', 'common.copied': 'Copiato',
  'common.search': 'Cerca', 'common.or': 'oppure', 'common.send': 'Spedisci', 'common.edit': 'Modifica', 'common.done': 'Fatto',
  'auth.login': 'Accedi', 'auth.register': 'Registrati', 'auth.email': 'Email', 'auth.password': 'Password', 'auth.username': 'Nome utente (@nick)',
  'auth.displayName': 'Come ti chiami', 'auth.birthDate': 'Data di nascita', 'auth.invite': 'Codice di invito', 'auth.lang': 'Lingua',
  'auth.terms': 'Accetto le regole e l’informativa sulla privacy', 'auth.withPassword': 'Accedi con password',
  'auth.withCode': 'Accedi con un codice via email', 'auth.sendCode': 'Inviami il codice', 'auth.code': 'Codice dall’email', 'auth.codeSent': 'Codice inviato: controlla la posta.',
  'auth.withPasskey': 'Accedi con una passkey', 'auth.childDevice': 'Sono un bambino: ho un codice dal genitore', 'auth.childCode': 'Codice del genitore',
  'auth.noAccount': 'Non hai un account?', 'auth.haveAccount': 'Hai già un account?', 'auth.under14': 'Per i minori di 14 anni il profilo lo crea un genitore dal proprio account.',
  'auth.inviteOnly': 'È in corso una beta chiusa: serve un link di invito da un amico.', 'auth.logout': 'Esci',
  'onb.title': 'Benvenuto alla stazione postale', 'onb.location': 'Dove ti trovi?',
  'onb.locationWhy': 'Il corriere deve sapere da dove partire. Le coordinate esatte restano solo sul server e non le vede nessuno: gli altri vedono la città, il paese o solo la distanza, come decidi tu.',
  'onb.allowLocation': 'Consenti la posizione', 'onb.locationOk': 'Posizione trovata', 'onb.install': 'Installa Colomba sulla schermata',
  'onb.installIos': 'Su iPhone: «Condividi» → «Aggiungi alla schermata Home». Senza questo le notifiche non arrivano (iOS 16.4+).',
  'onb.installBtn': 'Installa', 'onb.notify': 'Notifiche', 'onb.notifyWhy': 'Il corriere ti avviserà quando arriva una lettera.',
  'onb.allowNotify': 'Attiva le notifiche', 'onb.start': 'Alla stazione!',
  'station.title': 'Stazione postale', 'station.dovecote': 'Piccionaia', 'station.stable': 'Scuderia', 'station.pier': 'Molo', 'station.mailbox': 'Cassetta postale',
  'station.empty': 'Corrieri in viaggio', 'station.inFlight': 'In viaggio', 'station.slots': 'Posti', 'station.buySlot': 'Nuovo posto', 'station.catalog': 'Catalogo dei corrieri',
  'courier.status.home': 'a casa', 'courier.status.outbound': 'porta una lettera', 'courier.status.waiting': 'aspetta risposta', 'courier.status.returning': 'torna a casa',
  'courier.trips': 'viaggi', 'courier.rename': 'Dai un nome', 'courier.release': 'Lascia andare', 'courier.speed': 'Velocità', 'courier.capacity': 'Cosa porta',
  'courier.night': 'Di notte', 'courier.route': 'Percorso', 'courier.back': 'Torna', 'courier.waitUntil': 'Aspetta fino a', 'courier.flight': 'Guarda il volo',
  'courier.experience': 'Esperienza: +{n}% di velocità',
  'night.rest': 'riposa', 'night.night_only': 'vola solo di notte', 'night.always': 'viaggia giorno e notte', 'night.sea_only': 'sul mare vola, a terra riposa', 'night.hours': 'a orario',
  'route.air': 'in volo, aggira le montagne', 'route.air_sea': 'in volo, preferisce il mare', 'route.air_direct': 'in volo diretto',
  'route.land': 'su strada', 'route.land_sea': 'per terra e per mare', 'route.sea': 'per mare', 'route.post': 'strada e aereo',
  'cap.text': 'fino a {n} caratteri', 'cap.photos': '{n} foto', 'cap.drawings': 'disegno', 'cap.voice': 'voce fino a {n} min', 'cap.or': '1 foto o disegno', 'cap.textOnly': 'solo testo',
  'section.birds': 'Uccelli', 'section.animals': 'Animali', 'section.history': 'Storia', 'section.post': 'Posta',
  'catalog.title': 'Catalogo dei corrieri', 'catalog.owned': 'tuoi', 'catalog.get': 'Prendi', 'catalog.buy': 'Compra per {n}', 'catalog.locked': 'Missione',
  'catalog.outOfSeason': 'Fuori stagione', 'catalog.season': 'Stagionale: {m}',
  'quest.ocean_letter': 'Spedisci la prima lettera oltre l’oceano', 'quest.night_letter': 'Spedisci una lettera di notte',
  'quest.distance_5000': 'Le lettere hanno percorso 5.000 km', 'quest.letters_5': 'Spedisci 5 lettere', 'quest.long_correspondence': '10 lettere con la stessa persona',
  'mailbox.title': 'Cassetta postale', 'mailbox.incoming': 'In arrivo', 'mailbox.arrives': 'arriverà {t}', 'mailbox.empty': 'Ancora vuota. I corrieri non hanno fretta, ed è bellissimo.',
  'mailbox.requests': 'Piccioni con richieste di amicizia', 'mailbox.accept': 'Accetta', 'mailbox.decline': 'Rifiuta', 'mailbox.outbox': 'Spedite in viaggio',
  'mailbox.conversations': 'Corrispondenze', 'mailbox.box': 'Scatola dei ricordi', 'mailbox.drafts': 'Bozze',
  'letter.from': 'Da', 'letter.to': 'A', 'letter.open': 'Apri', 'letter.reply': 'Rispondi', 'letter.replyWith': 'Rispondi con «{name}»',
  'letter.postcard': 'Cartolina', 'letter.quick1': 'Ricevuta, ti rispondo presto!', 'letter.quick2': 'Grazie della lettera!', 'letter.quick3': 'Un abbraccio!',
  'letter.report': 'Segnala', 'letter.block': 'Blocca', 'letter.postmarks': 'Timbri', 'letter.read': 'Letta',
  'letter.delivered': 'Consegnata', 'letter.inTransit': 'In viaggio', 'letter.lost': 'Il corriere è in ritardo', 'letter.recall': 'Richiama il corriere',
  'letter.recallUntil': 'Puoi richiamarlo fino alle {t}', 'letter.removed': 'Lettera rimossa dal moderatore', 'letter.bottleFrom': 'Messaggio in bottiglia',
  'letter.someone': 'Qualcuno la ripescherà', 'letter.scheduled': 'Partenza programmata: {t}', 'letter.queued': 'Aspetta il ritorno del corriere',
  'compose.title': 'Nuova lettera', 'compose.to': 'Destinatario', 'compose.chooseFriend': 'Scegli un amico', 'compose.courier': 'Corriere', 'compose.paper': 'Carta e calligrafia',
  'compose.content': 'Lettera', 'compose.when': 'Quando spedire', 'compose.text': 'Testo', 'compose.photo': 'Foto', 'compose.voice': 'Voce', 'compose.drawing': 'Disegno',
  'compose.record': 'Registra', 'compose.stop': 'Stop', 'compose.clear': 'Cancella', 'compose.addDrawing': 'Aggiungi disegno', 'compose.handwrite': 'Scrivi a mano',
  'compose.now': 'Adesso', 'compose.schedule': 'A un’ora precisa', 'compose.arriveBy': 'Perché arrivi entro una data', 'compose.queue': 'Quando il corriere torna',
  'compose.surprise': 'Sorpresa: non avvisare il destinatario', 'compose.travel': 'In viaggio: {d}', 'compose.arrive': 'Arrivo: {t}', 'compose.distance': '{n} km',
  'compose.fits': 'Porta: {cap}', 'compose.over': 'Non ci sta: {what}', 'compose.draftSaved': 'Bozza salvata', 'compose.sent': 'Il corriere è partito!',
  'compose.confirmSlow': 'Il corriere impiegherà {d}. È un tempo onesto: spedire?', 'compose.noRoute': 'Questo corriere non ha un percorso del suo tipo fino al destinatario',
  'compose.stamp': 'Francobollo', 'compose.stickers': 'Adesivi', 'compose.font': 'Calligrafia', 'compose.bottle': 'Messaggio in bottiglia, senza destinatario',
  'compose.bottleHint': 'Lo ripescherà un utente adulto a caso, e potrebbe nascere una corrispondenza.', 'compose.tariff': 'Tariffa',
  'compose.multi': 'Invio a più persone', 'compose.addRecipient': 'Aggiungi destinatario', 'compose.pickCourier': 'Corrieri adatti',
  'compose.releaseAt': 'Ora di partenza', 'compose.arriveByDate': 'Data di arrivo', 'compose.scheduled': 'Il corriere partirà {t}',
  'compose.queued': 'Lettera in coda: il corriere partirà appena torna', 'compose.chars': '{n} / {max}',
  'compose.reply': 'Risposta con lo stesso corriere', 'compose.warnFarSea': 'Il destinatario è lontano dal mare: fino alla costa la porterà un messaggero',
  'flight.title': 'Volo', 'flight.onlySender': 'La mappa del volo la vedi solo tu.', 'flight.events': 'Diario di viaggio', 'flight.eta': 'Arrivo {t}',
  'flight.left': 'mancano {d}', 'flight.resting': 'riposa', 'flight.moving': 'in viaggio', 'flight.arrived': 'arrivato',
  'friends.title': 'Amici', 'friends.add': 'Aggiungi un amico', 'friends.byNick': 'Per @nick', 'friends.qr': 'QR code e link', 'friends.contacts': 'Dai contatti',
  'friends.penpals': 'Amici di penna', 'friends.bottle': 'Messaggio in bottiglia', 'friends.request': 'Chiedi l’amicizia', 'friends.requested': 'Richiesta inviata',
  'friends.pending': 'in attesa', 'friends.awaiting_parent': 'attende il genitore', 'friends.penpal': 'di penna', 'friends.write': 'Scrivi',
  'friends.remove': 'Rimuovi dagli amici', 'friends.myLink': 'Il tuo link di invito', 'friends.share': 'Condividi', 'friends.contactsNone': 'Il browser non supporta la scelta dei contatti.',
  'friends.contactsWhy': 'Controlliamo solo gli indirizzi che scegli e non salviamo nulla.', 'friends.empty': 'Ancora nessuno. Invita un amico con il link o il QR code.',
  'penpal.mode.interests': 'Per interessi', 'penpal.mode.language': 'Scambio linguistico', 'penpal.mode.near': 'Vicino', 'penpal.mode.far': 'Dall’altra parte del mondo', 'penpal.mode.random': 'A caso',
  'penpal.enable': 'Possono trovarmi nella ricerca di amici di penna', 'penpal.connect': 'Inizia a scrivere', 'penpal.adultsOnly': 'La ricerca di sconosciuti è solo per adulti.',
  'profile.letters': 'lettere', 'profile.collection': 'Collezione di corrieri', 'profile.interests': 'Interessi', 'profile.languages': 'Lingue',
  'album.title': 'Album', 'album.postmarks': 'Timbri', 'album.countries': 'Paesi', 'album.stamps': 'Francobolli', 'album.achievements': 'Traguardi',
  'album.couriers': 'Corrieri', 'album.empty': 'I timbri compariranno quando le lettere passeranno per le città.',
  'shop.title': 'Bottega', 'shop.buy': 'Per {n}', 'shop.owned': 'Già tuo', 'shop.notNow': 'Solo durante la festa', 'shop.noMoney': 'Semi insufficienti',
  'shop.kind.paper': 'Carta', 'shop.kind.envelope': 'Buste', 'shop.kind.stamp': 'Francobolli', 'shop.kind.sticker': 'Adesivi', 'shop.kind.tariff': 'Tariffe della Posta',
  'semi.title': 'Semi', 'semi.hint': 'I semi si guadagnano soltanto: con le lettere consegnate, le risposte, le lunghe corrispondenze, i traguardi e la visita quotidiana. In Colomba non esistono soldi veri.',
  'semi.daily': '+{n} seme per la visita di oggi',
  'settings.title': 'Impostazioni', 'settings.profile': 'Profilo', 'settings.privacy': 'Privacy', 'settings.notifications': 'Notifiche',
  'settings.security': 'Accesso e sicurezza', 'settings.children': 'Profili dei bambini', 'settings.about': 'Informazioni', 'settings.danger': 'Eliminazione dell’account',
  'settings.lang': 'Lingua dell’interfaccia', 'settings.bio': 'Su di me', 'settings.avatar': 'Avatar', 'settings.country': 'Paese',
  'settings.locPrecision': 'Cosa vedono gli altri della mia posizione', 'settings.loc.city': 'La città', 'settings.loc.country': 'Il paese', 'settings.loc.distance': 'Solo la distanza',
  'settings.whoCanWrite': 'Chi può scrivermi', 'settings.who.friends': 'Solo gli amici', 'settings.who.friends_penpals': 'Amici e amici di penna',
  'settings.who.everyone': 'Tutti gli adulti', 'settings.readReceipts': 'Mostra al mittente la conferma di lettura',
  'settings.bottle': 'Voglio ripescare messaggi in bottiglia', 'settings.push': 'Notifiche push su questo dispositivo', 'settings.pushOn': 'attive', 'settings.pushOff': 'disattivate',
  'settings.digest': 'Riepilogo ogni mattina invece delle singole notifiche di viaggio', 'settings.tripEvents': 'Avvisami degli eventi in viaggio',
  'settings.sounds': 'Suoni dei corrieri', 'settings.animations': 'Animazioni', 'settings.theme': 'Tema', 'settings.theme.auto': 'Come il sistema', 'settings.theme.light': 'Chiaro', 'settings.theme.dark': 'Scuro',
  'settings.passkeys': 'Passkey', 'settings.addPasskey': 'Aggiungi una passkey', 'settings.changePassword': 'Cambia password',
  'settings.currentPassword': 'Password attuale', 'settings.newPassword': 'Nuova password', 'settings.export': 'Scarica i miei dati',
  'settings.deleteWarn': 'L’account sarà eliminato. Le lettere resteranno ai destinatari, ma l’autore diventerà anonimo. Non si può annullare.',
  'settings.deleteConfirm': 'Scrivi DELETE per confermare', 'settings.deleteBtn': 'Elimina l’account per sempre', 'settings.updateLocation': 'Aggiorna la mia posizione',
  'settings.blocked': 'Bloccati', 'settings.unblock': 'Sblocca', 'settings.legal': 'Regole e privacy',
  'children.add': 'Crea un profilo per un bambino', 'children.consent': 'Sono il genitore o il tutore legale e acconsento al trattamento dei dati del bambino',
  'children.deviceCode': 'Codice di accesso per il dispositivo del bambino', 'children.codeHint': 'Il bambino lo inserisce nella schermata di accesso: «Sono un bambino». Il codice vale 24 ore.',
  'children.requests': 'Richieste di amicizia in attesa della tua approvazione', 'children.approve': 'Approva', 'children.wants': '{other} vuole essere amico di {child}',
  'children.rules': 'In modalità bambino: scrivono solo gli amici approvati da te; ricerca di sconosciuti, bottiglie e contatti non sono disponibili; la posizione non è più precisa della città.',
  'report.title': 'Segnalazione', 'report.reason': 'Motivo', 'report.spam': 'Spam', 'report.abuse': 'Insulti', 'report.inappropriate': 'Contenuto inappropriato',
  'report.child_safety': 'Pericolo per un minore', 'report.other': 'Altro', 'report.comment': 'Commento', 'report.alsoBlock': 'Blocca subito', 'report.sent': 'Segnalazione inviata. La esaminerà un amministratore.',
  'notif.title': 'Notifiche', 'notif.empty': 'Nessuna novità: i corrieri sono in viaggio.',
  'about.text': 'Colomba è un progetto per passione: gratis, senza pubblicità e senza soldi veri. La lentezza è un piacere.',
  'about.attribution': 'Dati e servizi',
  'admin.title': 'Pannello di amministrazione', 'admin.couriers': 'Corrieri ed eventi', 'admin.reports': 'Segnalazioni', 'admin.stats': 'Statistiche', 'admin.broadcasts': 'Comunicazioni',
  'admin.invites': 'Inviti', 'admin.users': 'Utenti', 'admin.settings': 'Impostazioni',
  'err.unauthorized': 'Devi accedere', 'err.invalid_credentials': 'Email o password errate', 'err.username_taken': 'Questo nick è già preso', 'err.email_taken': 'Questa email è già registrata',
  'err.invite_required': 'Serve un codice di invito', 'err.invite_invalid': 'Invito non valido', 'err.courier_busy': 'Il corriere è occupato',
  'err.over_capacity': 'La lettera non ci sta nel carico del corriere', 'err.no_route': 'Via terra non si arriva: scegli un uccello, una nave o la posta',
  'err.no_sea_route': 'Per mare non si arriva', 'err.tariff_needs_land': 'La posta via terra non arriva lì: serve la tariffa Aerea', 'err.too_slow': 'Troppo lento perfino per una lumaca',
  'err.recipient_accepts_friends_only': 'Il destinatario accetta lettere solo dagli amici', 'err.child_only_approved_friends': 'Ai bambini scrivono solo gli amici approvati dal genitore',
  'err.blocked': 'Corrispondenza bloccata', 'err.not_enough_semi': 'Semi insufficienti', 'err.no_free_slot': 'Nessun posto libero',
  'err.quest_not_completed': 'Prima completa la missione', 'err.recall_window_passed': 'Il corriere è già lontano: non si può richiamare', 'err.no_sender_location': 'Non sappiamo dove sei: consenti la posizione',
  'err.recipient_has_no_location': 'Il destinatario non ha ancora aperto l’app: non si sa dove andare', 'err.empty_letter': 'La lettera è vuota',
  'err.no_one_to_catch_bottle': 'Per ora nessuno può ripescare la bottiglia', 'err.banned': 'Account bloccato', 'err.child_must_be_created_by_parent': 'Per i minori di 14 anni il profilo lo crea un genitore',
  'err.cannot_arrive_in_time': 'Non arriverebbe in tempo nemmeno partendo adesso', 'err.postcard_too_long': 'La cartolina: fino a 140 caratteri, senza allegati',
  'err.courier_out_of_season': 'Questo corriere ora è fuori stagione', 'err.tariff_not_owned': 'Questa tariffa non è ancora tua', 'err.wrong_password': 'Password errata',
};

export type TKey = keyof typeof ru;
export const DICTS: Record<Lang, Dict> = { ru, it };

export function translate(lang: Lang, key: TKey | string, params?: Record<string, string | number>): string {
  let s = (DICTS[lang] as Record<string, string>)[key] ?? (ru as Record<string, string>)[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export const LangContext = createContext<Lang>('ru');

export function useT() {
  const lang = useContext(LangContext);
  const t = (key: TKey | string, params?: Record<string, string | number>) => translate(lang, key, params);
  return { t, lang };
}

/** Длительность по-человечески: «4 дня 6 ч», «15 лет». */
export function formatDuration(sec: number, lang: Lang): string {
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const y = d / 365;
  const ru = lang === 'ru';
  const plural = (n: number, one: string, few: string, many: string) => {
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
    return many;
  };
  if (y >= 2) {
    const yy = Math.round(y);
    return ru ? `≈ ${yy} ${plural(yy, 'год', 'года', 'лет')}` : `≈ ${yy} anni`;
  }
  if (d >= 60) {
    const mo = Math.round(d / 30);
    return ru ? `≈ ${mo} ${plural(mo, 'месяц', 'месяца', 'месяцев')}` : `≈ ${mo} mesi`;
  }
  if (d >= 1) {
    const hh = h % 24;
    const dd = ru ? `${d} ${plural(d, 'день', 'дня', 'дней')}` : `${d} ${d === 1 ? 'giorno' : 'giorni'}`;
    return hh ? `${dd} ${hh} ${ru ? 'ч' : 'h'}` : dd;
  }
  if (h >= 1) return `${h} ${ru ? 'ч' : 'h'} ${m % 60} ${ru ? 'мин' : 'min'}`;
  return `${Math.max(1, m)} ${ru ? 'мин' : 'min'}`;
}

export function formatDate(d: string | Date | null | undefined, lang: Lang, withTime = true): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString(lang === 'ru' ? 'ru-RU' : 'it-IT', withTime
    ? { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }
    : { day: 'numeric', month: 'long', year: 'numeric' });
}

export const MONTHS: Record<Lang, string[]> = {
  ru: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  it: ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'],
};
