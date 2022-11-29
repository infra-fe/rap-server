CREATE TABLE `tags_tab` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL,
  `level` varchar(32) DEFAULT NULL,
  `repository_id` int DEFAULT NULL,
  `color` varchar(32) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `interfaces_tags_tab` (
  `interface_id` int NOT NULL,
  `tag_id` int NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`interface_id`,`tag_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
