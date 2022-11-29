CREATE TABLE `scenes_tab` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `scene_key` varchar(256) DEFAULT NULL,
  `scene_name` varchar(256) DEFAULT NULL,
  `scene_data` json DEFAULT NULL,
  `interface_id` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;