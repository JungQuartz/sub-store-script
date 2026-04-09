import json
import os
from fastapi import FastAPI
import asyncio
from tasks import start_scheduler, run_test_job

app = FastAPI(title="Node Analyzer Cache API")
CACHE_FILE = "results.json"

@app.on_event("startup")
async def startup_event():
    # 启动后台异步调度任务
    start_scheduler()
    print("[Server] 后台调度器已激活，将定期获取 Sub-Store 节点测速...")

@app.get("/api/cache")
async def get_cache():
    """ 供 Sub-Store 获取并合并标签 """
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return {"status": "ok", "data": data}
        except Exception as e:
            return {"status": "error", "message": str(e), "data": {}}
    return {"status": "ok", "data": {}}

@app.post("/api/trigger")
async def trigger_run():
    """ 触发后台立即执行一套全跑测试 """
    asyncio.create_task(run_test_job())
    return {"status": "async testing started"}

if __name__ == "__main__":
    import uvicorn
    # 本地监听 8000 暴露使用
    uvicorn.run(app, host="0.0.0.0", port=8000)
