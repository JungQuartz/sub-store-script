import os
import json
import httpx
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from core_runner import verify_nodes_batch

# 环境变量传递或写死您 Sub-Store 的原始导出（未二次加工前或者已用通用模板化处理后）的链接
# 注意：一定要把 target 指定为 ClashMeta 格式，Python 解析会非常简单！
SUB_URL = os.getenv("SUB_URL", "http://192.168.100.191:3000/download/xxx?target=ClashMeta") 
CACHE_FILE = "results.json"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def run_test_job():
    logger.info(f"[Job] 正在从 {SUB_URL} 获取最新 ClashMeta 节点集...")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(SUB_URL)
            resp.raise_for_status()
            
            import yaml
            data = yaml.safe_load(resp.text)
            proxies = data.get("proxies", [])
    except Exception as e:
        logger.error(f"[Job] 获取并解析节点集失败: {e}")
        return

    if not proxies:
        logger.warning(f"[Job] 抓取的节点列表为空，跳过内核测试。")
        return

    logger.info(f"[Job] 获取到 {len(proxies)} 个完整节点参数，拉起底层 Mihomo 引擎开始测试...")
    
    # 核心测流：由于此步跑的是超真实的 http(s) 长连接和握手，所以可能耗时十多分钟甚至半小时以上。
    results_map = await verify_nodes_batch(proxies)

    # 将跑出来的标签做成 K-V 字典按 Server 地址落盘 
    # {"8.8.8.8": ["NF", "GPT"], "google.com": ["NF自制"]}
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(results_map, f, ensure_ascii=False)
        
    logger.info(f"[Job] 测试完毕，已完备缓存 {len(results_map)} 条流媒体/AI解锁结果字典。")


def start_scheduler():
    scheduler = AsyncIOScheduler()
    # 根据你的接受度决定：每天 02:00、08:00、14:00、20:00 各执行一次刷新？或者使用间隔 (hours=6)
    scheduler.add_job(run_test_job, 'interval', hours=6, max_instances=1)
    scheduler.start()
