CREATE TABLE `auto_import_tab` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `repository_id` int unsigned DEFAULT NULL,
  `task_name` varchar(256) DEFAULT NULL,
  `import_source` varchar(32) DEFAULT NULL,
  `frequency` varchar(32) DEFAULT NULL,
  `import_host` varchar(256) DEFAULT NULL,
  `import_project_id` varchar(256) DEFAULT NULL,
  `import_token` varchar(256) DEFAULT NULL,
  `version_id` int unsigned DEFAULT NULL,
  `creator_id` int DEFAULT NULL,
  `created_at` bigint unsigned NOT NULL,
  `updated_at` bigint unsigned  NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_repository_id` (`repository_id`),
  KEY `idx_version_id` (`version_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `auto_import_history_tab` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `auto_import_id` int unsigned DEFAULT NULL,
  `import_status` varchar(32) DEFAULT NULL,
  `import_trigger_type` varchar(32) DEFAULT NULL,
  `message` text,
  `created_at` bigint unsigned NOT NULL,
  `updated_at` bigint unsigned  NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_auto_import_id` (`auto_import_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

