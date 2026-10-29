# EncorePass

Apple Wallet 自定义活动票卡生成器。手动填写活动信息，自定义背景图片 / Logo / 角标 / 二级标志与条码；上传图片时可框选显示区域，并随时重新调整。提供活动门票、活动门票(海报)与通用凭证三种票卡样式。

## 开始使用

需要 Node.js 22.13+（推荐 Node.js 24）和 npm。

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Windows PowerShell 使用 `Copy-Item .env.example .env.local`。打开 [http://localhost:3000](http://localhost:3000)。默认无需证书即可编辑并导出 JSON 票卡数据，导入后可继续编辑。开启第三方签发选项后可获取 Wallet 票卡。

## 部署与签名

设置 `.env.local` 中的 `ACCESS_PASSWORD` 后运行 `docker compose up -d --build`。浏览器弹出认证框时，用户名任意，密码使用该配置。默认只绑定宿主机 `127.0.0.1:3000`。

本地签名需配置 Apple Pass Type ID、Team ID、Pass 证书、私钥及 WWDR 中间证书。详见 [部署与签名](agent-docs/OPERATIONS.md#local-signing)。开启签名后使用 `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build`，证书目录只读挂载。

## 数据与隐私

- 默认情况下，你的所有数据都存储在你的浏览器本地，EncorePass 不会收集与上传任何信息
- 当你选择将票卡添加到 Apple 钱包，或者以任何形式通过本站生成 .pkpass 文件时，你的票卡数据会被发送给第三方以及 Apple 用来生成可以加入设备的票卡
- 上传的数据仅用于生成票卡。票卡的下载有效期为生成后的一小时内，之后你上传的信息会被删除

## 使用限制

- 自制票卡不能作为官方入场凭证，无法替代原票、动态二维码、身份证明等官方指定的入场凭证
- 条码仅供展示, EncorePass 不保证票卡中条码的实际可用性
- 票卡由第三方签发，不代表活动主办方或 Apple 的认证

## 许可

MIT
