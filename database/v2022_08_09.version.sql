CREATE TABLE `repository_version_tab` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `repository_id` int(11) NOT NULL,
  `version_name` varchar(256) NOT NULL,
  `lock_type` enum('import','merge') DEFAULT NULL,
  `is_master` BOOLEAN DEFAULT 0,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE `Modules`
  ADD COLUMN `versionId` int(11) DEFAULT NULL;

ALTER TABLE `history_log`
  ADD COLUMN `versionId` int(11) DEFAULT NULL;