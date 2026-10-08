# Kiwi Garden · 几维鸟的小庭院

一只用 Three.js 程序化建模、身体前倾、豆豆眼、带柔软绒毛贴图的几维鸟，和一片铺满页面的卡通草地。画面只保留场景与角落操作说明，没有操作按钮。

## 玩法

- **鼠标跟随**：在花园里移动鼠标，几维鸟会走过来；移出花园会停下。
- **键盘漫游**：直接用方向键或 WASD 走路，按键期间鼠标只控制头的朝向；松开按键后再次移动鼠标，就恢复鼠标跟随。
- **啄一下**：点击花园或按空格。靠近目标后，蘑菇会弹起来、草丛会摇晃、木方块会被啄开。
- **推方块**：直接走近木方块，把它推着走。
- **手机**：在场景上拖动手指引导行走，松手停下；轻点场景啄击。
- **退出键盘控制**：Escape 释放游戏焦点；点击场景重新进入。刷新页面可重新开始。

## 本地开发

需要 Node.js 22.12+（推荐 24）和 pnpm 10.34.6。

```sh
corepack pnpm install
corepack pnpm dev
```

打开 http://127.0.0.1:5188 。

```sh
corepack pnpm test
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
corepack pnpm build
corepack pnpm preview
```

浏览器测试会复用已经运行的 5188 端口，不重复启动本地服务。

## 实现

Vue 负责全屏画布容器和操作说明；Three.js 负责模型、光照、阴影、射线拾取和逐帧动画。鸟和场景全部由代码生成，无外部模型、贴图或字体请求。圆润模型配程序生成的颜色与凹凸贴图，走路会大幅抬腿、左右摇摆和弹跳；转头、啄击有独立动画；键盘按相机画面方向移动，斜向速度一致。几维鸟和方块都能在当前可视草地范围内移动，并在画面边缘停下。

支持触屏手势、窗口失焦释放、后台暂停、减少动态偏好，以及 WebGL 不可用或连接丢失时的提示。需要支持 WebGL 2 的浏览器。

## 部署

部署在 Zeabur 的 `dont_know` 项目中。使用仓库内 Dockerfile：Node.js 24 构建静态文件，Nginx 在 8080 端口提供页面。GitHub Actions 对每次 main 推送运行单元测试、桌面/手机浏览器测试和生产构建。

```sh
zeabur deploy --create --project-id <project-id> --name kiwi --interactive=false
```

当前服务：`kiwi`（`6ac7511723b127f0723a1725`），环境：`69b10a8f663e36e8afe6376e`。按当前要求暂未绑定公开域名；博客项目入口指向源码仓库。

更新现有服务：

```sh
zeabur deploy --project-id 69b10a8f32c5760c4a4be768 --service-id 6ac7511723b127f0723a1725 --environment-id 69b10a8f663e36e8afe6376e --interactive=false
```

相对资源路径也支持子目录及普通静态托管。

- 源码：https://github.com/011011100/kiwi
- 博客：https://011011100.github.io/projects.html
