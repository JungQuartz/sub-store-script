# Python Node Analyzer (旁路自动化测速池)

这是一个基于 Python 的本地订阅节点高阶测速服务。
系统通过拉起真实的 Mihomo (Clash Meta) 底层引擎进行连通性打流检测（目前支持 Netflix/ChatGPT/Claude/Gemini 的硬核真实 HTTP 状态检测），支持定时批量测试。最终将解锁和标签状态落地生成为本地缓存字典，提供给远端 Sub-Store 的 JS 脚本做 0 延迟秒速调用。

---

## 环境要求
* 目标宿主机环境 (您的 Mac Mini，或其他 Linux)
* Python 3.8+
* 极速包管理器 [uv](https://github.com/astral-sh/uv) (推荐)

---

## 🛠 一、部署前准备

### 1. 下载核心引擎 (Mihomo Binary)
由于测速极度依赖真实内核环境支持，您需前往官方仓库下载与目标主机（Mac Mini 如果是 M 系列芯片则寻找 `darwin-arm64` 版本；Intel 则是 `darwin-amd64` 版本）的最新代码包：
👉 [MetaCubeX/mihomo Releases](https://github.com/MetaCubeX/mihomo/releases)
   
### 2. 置入引擎并赋予运行权限
解压您的下载件，将最终得到的二进制文件重命名为 `mihomo`（不要后缀），并在当前 `python-analyzer` 根目录将其粘贴放入，紧接着为其赋予系统的可执行权限：
```bash
chmod +x mihomo
```

---

## 🚀 二、配置与启动安装

请通过 `uv` 跑通以下极简依赖安装流程：

```bash
# 1. 确保进入工程目录
cd /路径/到您的/python-analyzer

# 2. 创建 Python 独立隔离虚拟环境
uv venv

# 3. 激活虚拟环境 (以下为 zsh 及多数 sh 示例)
source .venv/bin/activate

# 4. 一键安装依赖
uv pip install -r requirements.txt
```

### 修改订阅数据源 (极其关键！)
任意编辑器打开 `tasks.py` 文件，定位到头部这一段代码：
```python
SUB_URL = os.getenv("SUB_URL", "http://192.168.100.191:3000/download/xxx?target=ClashMeta")
```
**务必将备用链接或环境变量的 `SUB_URL` 变更为您从 Sub-Store 等后台所抛出的原版全量节点 URL。** 
> 💡：URL 结尾最好带有请求参数使其输出为 YAML/Clash 阵列格式，让 Python 加载最为平滑。

### 跑起来！
在同样的 `.venv` 激活终端中启动常驻缓存拉取系统：
```bash
python3 analyzer_server.py
```
*（执行完毕后即挂载 `0.0.0.0:8000` 端口监听请求，同时内部 APScheduler 将每 6 小时进入后台开始循环拉取、自动测试引擎的打流流程）*

---

## 🧪 三、手动触发测试与验证

为了无需等待那漫长的 6 小时定时器便能立刻验证这套超级测速体系，请另开一个终端页强制唤醒探测任务：

```bash
curl -X POST http://127.0.0.1:8000/api/trigger
```

**此时您可以返回刚才的 Python 服务台观察到：**
1. 服务正在批量每 5 个一次进行分配独立动态端口的并发拉起任务。
2. 内部会源源不断打印请求流的情况与检测进度。
3. 当一切处理完毕，目录中会神不知鬼不觉生成一个 `results.json`，里面就是经过真机校验且带有 IP 寻址和解锁状态的热乎 JSON K-V 字典！

---

## 🔌 四、联通并融合 Sub-Store

不要小看这一步。在部署好的 Sub-Store （192.168.100.191）系统里，确保将咱们开发好的完整 `ss_node_optimizer.js` （JS版本）放进配置文件的 **脚本操作 (Script Operator)**。

当在客户端订阅该节点链接，或使用其他客户端发请求刷新时，由于它现在最后一段带着抓取接口的代码：
`http://192.168.100.191:8000/api/cache` 

它会在不卡壳、不超时、0等候的情况下高速拉走您通过真内核检测出来的那份 `results.json` 结果并做聚合匹配改名，最终输出极致干净完美的顶级节点全集！
