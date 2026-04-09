import os
import subprocess
import yaml
import asyncio
import httpx
import logging

logger = logging.getLogger(__name__)

async def test_proxy(proxy_dict, port):
    """
    针对单独的节点，单独开一个干净的内核配置拉起。
    然后使用 httpx 走这个配置暴射出的 port (Socks/HTTP混合) 去摸奈飞与 ChatGPT 接口。
    """
    # 构建包含单节点的临时极简配置
    config = {
        "mixed-port": port,
        "allow-lan": False,
        "mode": "Global",
        "log-level": "silent", # 关闭内核冗杂输出
        "proxies": [proxy_dict],
        "proxy-groups": [{"name": "PROXY", "type": "select", "proxies": [proxy_dict["name"]]}],
        "rules": ["MATCH,PROXY"]
    }
    
    config_path = f"temp_conf_{port}.yaml"
    with open(config_path, "w", encoding='utf-8') as f:
        yaml.dump(config, f)
        
    # 重要提醒：此处需要您的同目录下放着从 GitHub 下载解压好的 `mihomo` 二进制执行文件，并给了 `chmod +x` 权限！
    # 如果系统识别不到，此处代码会有引发 FileNotFound 异常的可能。
    p = None
    try:
        p = subprocess.Popen(["./mihomo", "-d", ".", "-f", config_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except FileNotFoundError:
        logger.error("未找到局部可执行的 ./mihomo 内核文件！请下载内核解压放入此文件夹！")
        if os.path.exists(config_path):
            os.remove(config_path)
        return []

    # 给内核 1.2 秒时间完整启动各种握手端口绑定
    await asyncio.sleep(1.2)
    
    tags = []
    proxy_url = f"http://127.0.0.1:{port}"
    
    try:
        async with httpx.AsyncClient(proxies=proxy_url, timeout=6.0, verify=False) as client:
            # 1. 测 GPT
            try:
                r1 = await client.get("https://chatgpt.com/")
                if r1.status_code in (200, 301, 302, 307):
                    tags.append("GPT")
            except Exception: pass
                
            # 2. 测 Netflix
            try:
                r2 = await client.get("https://www.netflix.com/title/81215567")
                if r2.status_code == 200:
                    tags.append("NF")
                elif r2.status_code == 404:
                    tags.append("NF自制")
            except Exception: pass
            
            # TODO: 后续在这里查真知 IP 物理库
            
    except Exception as e:
        logger.debug(f"节点测试连接总控级超时/错误 {proxy_dict['name']}: {e}")
    finally:
        p.terminate() # 打流结束，毫不留情地杀掉内核
        try:
           os.remove(config_path)
        except OSError:
           pass
           
    return tags

async def verify_nodes_batch(proxies):
    results = {}
    
    # 这里非常关键：为了防止启动几十个进程把宿主机挤爆或内存分配溢出，严格控制并发（此处使用切割 chunk 的伪慢并发）
    # 给定一个动态基准端口
    base_port = 10000
    batch_size = 5 # 每次拉起 5 个内核测 5 个节点
    
    for i in range(0, len(proxies), batch_size):
        chunk = proxies[i:i+batch_size]
        tasks = []
        for idx, p in enumerate(chunk):
             # 每个同时工作的内核分配独立的监听端口
             dynamic_port = base_port + idx
             tasks.append(test_proxy(p, dynamic_port))
             
        res = await asyncio.gather(*tasks)
        
        for p, t in zip(chunk, res):
            if t: # 有打上 tag 的才存入
                # 用 server (物理 IP 域名) 作为匹配 key，而不是 name
                # 因为 name 可能被改，但 IP 作为索引永远匹配！
                results[p.get('server', p.get('name'))] = t
                
    return results
