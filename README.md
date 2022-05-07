# RAP-Server 开源社区版本 (后端 API 服务器)

### Intro 介绍

RAP is a new project based on [RAP1](https://github.com/thx/RAP) & [RAP2](https://github.com/thx/rap2-delos). It has two components:
RAP是在RAP1 & RAP2基础上重做的新项目，它包含两个组件(对应两个Github Repository)。

* rap-server: back-end data API server based on Koa + MySQL [link](https://github.com/infra-fe/rap-client)
* rap-client: front-end static build based on React [link](https://github.com/infra-fe/rap-server)

* rap-server:使用Koa + MySQL的后端API服务器 [link](https://github.com/infra-fe/rap-client)
* rap-client: React前端App [link](https://github.com/infra-fe/rap-server)

### Support 客户支持

<img src="https://user-images.githubusercontent.com/13103261/167248620-1e8e65fd-57a9-434c-b2fc-2d8c215d56fe.png" alt="wechat support" width=200 />

## 推荐使用 Docker 快速部署

### 安装 Docker

国内用户可参考 [https://get.daocloud.io/](https://get.daocloud.io/) 安装 Docker 以及 Docker Compose (Linux 用户需要单独安装)，建议按照链接指引配置 Docker Hub 的国内镜像提高加载速度。

### 配置项目

在任意地方建立目录 rap

把本仓库中的 [docker-compose.yml](https://github.com/infra-fe/rap-server/master/docker-compose.yml) 放到 rap 目录中

Rap 前端服务的端口号默认为 3800，你可以在 docker-compose.yml 中按照注释自定义

在 rap 目录下执行下面的命令：

```sh
# 拉取镜像并启动
docker-compose up -d

# 启动后，第一次运行需要手动初始化mysql数据库
# ⚠️注意: 只有第一次该这样做
docker-compose exec rapserver node scripts/initSchema.js force

# 部署成功后 访问
http://localhost:3800 # 前端（可自定义端口号）
http://localhost:38080 # 后端

# 如果访问不了可能是数据库没有链接上，关闭 rap 服务
docker-compose down
# 再重新运行
docker-compose up -d
# 如果 Sequelize 报错可能是数据库表发生了变化，运行下面命令同步
docker-compose exec rapserver node scripts/updateSchema
```

**⚠️注意：第一次运行后 rap 目录下会被自动创建一个 docker 目录，里面存有 rap 的数据库数据，可千万不要删除。**

### 镜像升级

Rap 经常会进行 bugfix 和功能升级，用 Docker 可以很方便地跟随主项目升级

```sh
# 拉取一下最新的镜像
docker-compose pull
# 暂停当前应用
docker-compose down
# 重新构建并启动
docker-compose up -d --build
# 有时表结构会发生变化，执行下面命令同步
docker-compose exec delos node scripts/updateSchema
# 清空不被使用的虚悬镜像
docker image prune -f
```

## 手动部署

### 环境要求

- Node.js 16.0+
- MySQL 5.7+
- Redis 4.0+
- pandoc 2.73 (供文档生成使用)

### 开发模式

#### 安装 MySQL 和 Redis 服务器

请自行查找搭建方法，mysql/redis 配置在 config.\*.ts 文件中，在不修改任何配置的情况下，
redis 会通过默认端口 + 本机即可正常访问，确保 redis-server 打开即可。

注意：修改 cofig 文件后需要重新 `npm run build` 才能生效

#### 安装 pandoc

我们使用 pandoc 来生成 Rap 的离线文档，安装 Pandoc 最通用的办法是在 pandoc 的 [release 页面](https://github.com/jgm/pandoc/releases/tag/2.7.3)下载对应平台的二进制文件安装即可。

其中 linux 版本最好放在`/usr/local/bin/pandoc` 让终端能直接找到，并执行 `chmod +x /usr/local/bin/pandoc` 给调用权限。

测试在命令行执行命令 `pandoc -h` 有响应即可。

#### 启动redis-server

```sh
redis-server
```

后台执行可以使用 nohup 或 pm2，这里推荐使用 pm2，下面命令会安装 pm2，并通过 pm2 来启动 redis 缓存服务

```bash
npm install -g pm2
npm run start:redis
```

#### 先创建创建数据库

```bash
mysql -e 'CREATE DATABASE IF NOT EXISTS RAP2_DELOS_APP DEFAULT CHARSET utf8 COLLATE utf8_general_ci'
```

#### 初始化

```bash
npm install
```

confirm configurations in /config/config.dev.js (used in development mode)，确认/config/config.dev.js 中的配置(.dev.js 后缀表示用于开发模式)。

#### 安装 && TypeScript 编译

```bash
npm install -g typescript
npm run build
```

#### 初始化数据库表

```bash
npm run create-db
```

#### 执行 mocha 测试用例和 js 代码规范检查

```bash
npm run check
```

#### 启动开发模式的服务器 监视并在发生代码变更时自动重启
```bash
npm run dev
```

### 生产模式

```sh
# 1. 修改/config/config.prod.js中的服务器配置
# 2. 启动生产模式服务器
npm start

```

## 社区贡献

- [rap2-javabean 自动从 Rap 接口生成 Java Bean](https://github.com/IndiraFinish/rap2-javabean)
- [rap2-generator 把 Java Bean 生成到 Rap](https://github.com/kings1990/rap2-generator)

## Author 作者

* Owner: Shopee Infra FE Team
* Contributers: [link](https://github.com/infra-fe/rap-client/graphs/contributors)

* 所有人: Shopee Infra FE Team
* 贡献者: [link](https://github.com/infra-fe/rap-client/graphs/contributors)


### Tech Arch 技术栈

* Front-end (rap-client)
    * React / Redux / Saga / Router
    * Mock.js
    * SASS / Bootstrap 4 beta
    * server: nginx
* Back-end (rap-server)
    * Koa
    * Sequelize
    * MySQL
    * Server
    * server: node

