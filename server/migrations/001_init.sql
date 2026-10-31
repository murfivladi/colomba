-- Colomba: начальная схема (MariaDB 10.6+ / MySQL 8)
-- Координаты — POINT с пространственным индексом, плюс lon/lat для простых выборок.

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NULL,
  password_hash VARCHAR(255) NULL,
  username VARCHAR(32) NOT NULL,
  display_name VARCHAR(64) NOT NULL,
  avatar VARCHAR(64) NOT NULL DEFAULT 'pigeon',
  bio VARCHAR(500) NOT NULL DEFAULT '',
  lang ENUM('ru','it') NOT NULL DEFAULT 'ru',
  languages JSON NULL,
  country CHAR(2) NULL,
  birth_date DATE NULL,
  kind ENUM('adult','child') NOT NULL DEFAULT 'adult',
  parent_id BIGINT UNSIGNED NULL,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  location_precision ENUM('city','country','distance') NOT NULL DEFAULT 'city',
  who_can_write ENUM('friends','friends_penpals','everyone') NOT NULL DEFAULT 'friends_penpals',
  read_receipts TINYINT(1) NOT NULL DEFAULT 1,
  penpal_enabled TINYINT(1) NOT NULL DEFAULT 0,
  bottle_enabled TINYINT(1) NOT NULL DEFAULT 1,
  daily_digest TINYINT(1) NOT NULL DEFAULT 0,
  sounds TINYINT(1) NOT NULL DEFAULT 1,
  animations TINYINT(1) NOT NULL DEFAULT 1,
  notify_trip_events TINYINT(1) NOT NULL DEFAULT 1,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Rome',
  semi INT NOT NULL DEFAULT 0,
  slots INT NOT NULL DEFAULT 4,
  letters_sent INT NOT NULL DEFAULT 0,
  letters_received INT NOT NULL DEFAULT 0,
  km_total DOUBLE NOT NULL DEFAULT 0,
  invite_code VARCHAR(16) NOT NULL,
  onboarded TINYINT(1) NOT NULL DEFAULT 0,
  last_login_day DATE NULL,
  last_digest_day DATE NULL,
  banned_until DATETIME NULL,
  ban_reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_invite (invite_code),
  KEY ix_users_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessions (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  KEY ix_sessions_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE passkeys (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  credential_id VARCHAR(512) NOT NULL,
  public_key BLOB NOT NULL,
  counter BIGINT UNSIGNED NOT NULL DEFAULT 0,
  transports VARCHAR(255) NULL,
  name VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_passkeys_cred (credential_id(255)),
  KEY ix_passkeys_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE webauthn_challenges (
  id CHAR(32) NOT NULL PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  challenge VARCHAR(255) NOT NULL,
  purpose ENUM('register','login') NOT NULL,
  expires_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE login_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NULL,
  user_id BIGINT UNSIGNED NULL,
  purpose ENUM('login','child_device') NOT NULL DEFAULT 'login',
  code_hash CHAR(64) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_login_codes_email (email),
  KEY ix_login_codes_token (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE invites (
  code VARCHAR(32) NOT NULL PRIMARY KEY,
  created_by BIGINT UNSIGNED NULL,
  uses_left INT NOT NULL DEFAULT 1,
  note VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE locations (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  pt POINT NOT NULL,
  lon DOUBLE NOT NULL,
  lat DOUBLE NOT NULL,
  accuracy_m DOUBLE NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  SPATIAL INDEX sx_locations_pt (pt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE friendships (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_a BIGINT UNSIGNED NOT NULL,
  user_b BIGINT UNSIGNED NOT NULL,
  status ENUM('pending','accepted','penpal','declined') NOT NULL DEFAULT 'pending',
  requested_by BIGINT UNSIGNED NOT NULL,
  parent_approved_a TINYINT(1) NOT NULL DEFAULT 1,
  parent_approved_b TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_friendship (user_a, user_b),
  KEY ix_friendship_b (user_b)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE interests (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  name_ru VARCHAR(64) NOT NULL,
  name_it VARCHAR(64) NOT NULL,
  UNIQUE KEY uq_interests_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user_interests (
  user_id BIGINT UNSIGNED NOT NULL,
  interest_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, interest_id),
  KEY ix_ui_interest (interest_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE courier_types (
  code VARCHAR(32) NOT NULL PRIMARY KEY,
  section ENUM('birds','animals','history','post') NOT NULL,
  speed_kmh DOUBLE NOT NULL,
  speed_water_kmh DOUBLE NULL,
  night_mode ENUM('rest','night_only','always','sea_only','hours') NOT NULL,
  route_kind ENUM('air','air_sea','air_direct','land','land_sea','sea','post') NOT NULL,
  capacity JSON NOT NULL,
  unlock_rule JSON NOT NULL,
  look VARCHAR(32) NOT NULL,
  sound VARCHAR(32) NOT NULL,
  season_months JSON NULL,
  unpredictability DOUBLE NULL,
  wind_driven TINYINT(1) NOT NULL DEFAULT 0,
  no_return TINYINT(1) NOT NULL DEFAULT 0,
  illustration MEDIUMTEXT NULL,
  name_ru VARCHAR(64) NULL,
  name_it VARCHAR(64) NULL,
  sort INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE post_tariffs (
  code VARCHAR(16) NOT NULL PRIMARY KEY,
  car_kmh DOUBLE NOT NULL,
  hours_per_day DOUBLE NOT NULL,
  plane_kmh DOUBLE NULL,
  sorting_hours DOUBLE NOT NULL,
  unlock_rule JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE couriers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT UNSIGNED NOT NULL,
  type_code VARCHAR(32) NOT NULL,
  name VARCHAR(40) NOT NULL,
  trips INT NOT NULL DEFAULT 0,
  km_total DOUBLE NOT NULL DEFAULT 0,
  status ENUM('home','outbound','waiting','returning') NOT NULL DEFAULT 'home',
  current_trip_id BIGINT UNSIGNED NULL,
  waiting_letter_id BIGINT UNSIGNED NULL,
  waiting_until DATETIME NULL,
  available_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_couriers_owner (owner_id),
  KEY ix_couriers_status (status, waiting_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE letters (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  from_id BIGINT UNSIGNED NOT NULL,
  to_id BIGINT UNSIGNED NULL,
  courier_id BIGINT UNSIGNED NULL,
  courier_type VARCHAR(32) NULL,
  tariff VARCHAR(16) NULL,
  kind ENUM('letter','postcard','broadcast','welcome') NOT NULL DEFAULT 'letter',
  reply_to_id BIGINT UNSIGNED NULL,
  group_id CHAR(16) NULL,
  is_bottle TINYINT(1) NOT NULL DEFAULT 0,
  body MEDIUMTEXT NULL,
  paper VARCHAR(32) NOT NULL DEFAULT 'cream',
  font VARCHAR(32) NOT NULL DEFAULT 'caveat',
  stamp VARCHAR(32) NULL,
  envelope VARCHAR(32) NULL,
  stickers JSON NULL,
  surprise TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('draft','scheduled','queued','in_transit','delivered','lost','recalled') NOT NULL DEFAULT 'draft',
  release_at DATETIME NULL,
  target_arrive_at DATETIME NULL,
  sent_at DATETIME NULL,
  arrive_at DATETIME NULL,
  delivered_at DATETIME NULL,
  read_at DATETIME NULL,
  origin_lon DOUBLE NULL,
  origin_lat DOUBLE NULL,
  dest_lon DOUBLE NULL,
  dest_lat DOUBLE NULL,
  distance_km DOUBLE NULL,
  lost TINYINT(1) NOT NULL DEFAULT 0,
  night_sent TINYINT(1) NOT NULL DEFAULT 0,
  ocean TINYINT(1) NOT NULL DEFAULT 0,
  removed TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_letters_from (from_id, status),
  KEY ix_letters_to (to_id, status),
  KEY ix_letters_status_arrive (status, arrive_at),
  KEY ix_letters_release (status, release_at),
  KEY ix_letters_courier (courier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE letter_media (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  letter_id BIGINT UNSIGNED NULL,
  owner_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('photo','voice','drawing') NOT NULL,
  path VARCHAR(255) NOT NULL,
  mime VARCHAR(64) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  duration_sec DOUBLE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_media_letter (letter_id),
  KEY ix_media_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE trips (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  letter_id BIGINT UNSIGNED NULL,
  courier_id BIGINT UNSIGNED NOT NULL,
  direction ENUM('out','back') NOT NULL,
  purpose ENUM('deliver','reply','return_empty','return_lost','recall') NOT NULL DEFAULT 'deliver',
  from_lon DOUBLE NOT NULL,
  from_lat DOUBLE NOT NULL,
  to_lon DOUBLE NOT NULL,
  to_lat DOUBLE NOT NULL,
  start_at DATETIME(3) NOT NULL,
  end_at DATETIME(3) NOT NULL,
  distance_km DOUBLE NOT NULL,
  timeline LONGTEXT NOT NULL,
  events JSON NOT NULL,
  route_source VARCHAR(32) NOT NULL,
  next_event_idx INT NOT NULL DEFAULT 0,
  status ENUM('active','done','recalled') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_trips_status_end (status, end_at),
  KEY ix_trips_letter (letter_id),
  KEY ix_trips_courier (courier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE route_cache (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cell_a VARCHAR(32) NOT NULL,
  cell_b VARCHAR(32) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  line LONGTEXT NOT NULL,
  length_km DOUBLE NOT NULL,
  source VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_route_cache (cell_a, cell_b, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE weather_cache (
  cell VARCHAR(32) NOT NULL,
  hour DATETIME NOT NULL,
  data JSON NOT NULL,
  PRIMARY KEY (cell, hour)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE postmarks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  trip_id BIGINT UNSIGNED NOT NULL,
  letter_id BIGINT UNSIGNED NULL,
  city_id BIGINT UNSIGNED NULL,
  name_ru VARCHAR(128) NOT NULL,
  name_it VARCHAR(128) NOT NULL,
  country CHAR(2) NOT NULL,
  stamped_at DATETIME NOT NULL,
  lon DOUBLE NOT NULL,
  lat DOUBLE NOT NULL,
  KEY ix_postmarks_trip (trip_id),
  KEY ix_postmarks_letter (letter_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE countries (
  code CHAR(2) NOT NULL PRIMARY KEY,
  name_ru VARCHAR(128) NOT NULL,
  name_it VARCHAR(128) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cities (
  id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  name_ru VARCHAR(200) NULL,
  name_it VARCHAR(200) NULL,
  country CHAR(2) NOT NULL,
  lon DOUBLE NOT NULL,
  lat DOUBLE NOT NULL,
  population INT UNSIGNED NOT NULL DEFAULT 0,
  pt POINT NOT NULL,
  SPATIAL INDEX sx_cities_pt (pt),
  KEY ix_cities_pop (population)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE achievements (
  code VARCHAR(48) NOT NULL PRIMARY KEY,
  category VARCHAR(32) NOT NULL,
  threshold DOUBLE NOT NULL DEFAULT 1,
  param VARCHAR(32) NULL,
  reward INT NOT NULL DEFAULT 5,
  name_ru VARCHAR(128) NOT NULL,
  name_it VARCHAR(128) NOT NULL,
  desc_ru VARCHAR(255) NOT NULL,
  desc_it VARCHAR(255) NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user_achievements (
  user_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(48) NOT NULL,
  achieved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user_quests (
  user_id BIGINT UNSIGNED NOT NULL,
  quest VARCHAR(32) NOT NULL,
  completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, quest)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE items (
  code VARCHAR(48) NOT NULL PRIMARY KEY,
  kind ENUM('stamp','envelope','paper','sticker','tariff','slot') NOT NULL,
  price INT NOT NULL DEFAULT 0,
  free TINYINT(1) NOT NULL DEFAULT 0,
  event_code VARCHAR(32) NULL,
  name_ru VARCHAR(128) NOT NULL,
  name_it VARCHAR(128) NOT NULL,
  data JSON NULL,
  sort INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user_items (
  user_id BIGINT UNSIGNED NOT NULL,
  item_code VARCHAR(48) NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE semi_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  amount INT NOT NULL,
  reason VARCHAR(32) NOT NULL,
  ref_id BIGINT UNSIGNED NULL,
  other_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_semi_user (user_id, created_at),
  KEY ix_semi_pair (user_id, other_user_id, reason, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reporter_id BIGINT UNSIGNED NOT NULL,
  target_user_id BIGINT UNSIGNED NOT NULL,
  letter_id BIGINT UNSIGNED NULL,
  reason ENUM('spam','abuse','inappropriate','child_safety','other') NOT NULL,
  comment VARCHAR(1000) NOT NULL DEFAULT '',
  status ENUM('open','resolved','dismissed') NOT NULL DEFAULT 'open',
  resolution VARCHAR(32) NULL,
  resolved_by BIGINT UNSIGNED NULL,
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_reports_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE blocks (
  blocker_id BIGINT UNSIGNED NOT NULL,
  blocked_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (blocker_id, blocked_id),
  KEY ix_blocks_blocked (blocked_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  until_at DATETIME NULL,
  reason VARCHAR(255) NOT NULL,
  admin_id BIGINT UNSIGNED NOT NULL,
  report_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_bans_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE push_subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  endpoint VARCHAR(700) NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_push_endpoint (endpoint(255)),
  KEY ix_push_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(32) NOT NULL,
  params JSON NULL,
  courier_type VARCHAR(32) NULL,
  letter_id BIGINT UNSIGNED NULL,
  for_digest TINYINT(1) NOT NULL DEFAULT 0,
  pushed TINYINT(1) NOT NULL DEFAULT 0,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_notifications_user (user_id, created_at),
  KEY ix_notifications_digest (for_digest, pushed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  kind ENUM('holiday','season','migration') NOT NULL,
  name_ru VARCHAR(128) NOT NULL,
  name_it VARCHAR(128) NOT NULL,
  start_md CHAR(5) NOT NULL,
  end_md CHAR(5) NOT NULL,
  params JSON NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_events_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE broadcasts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  text_ru TEXT NOT NULL,
  text_it TEXT NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  recipients INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE settings (
  k VARCHAR(64) NOT NULL PRIMARY KEY,
  v JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE api_usage (
  day DATE NOT NULL,
  service VARCHAR(32) NOT NULL,
  count INT NOT NULL DEFAULT 0,
  errors INT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, service)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
