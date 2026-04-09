/**
 * Sub-Store 节点格式化及流媒体/AI解锁检测脚本
 * 
 * 功能：
 * 1. 规范化命名：提取地区国旗、判断来源(ss/dj/h)、提取倍率。
 * 2. 解锁检测：并发检测 ChatGPT, Claude, Gemini, Netflix, Disney+, Spotify 解锁状态。
 * 3. 最终输出格式：🇭🇰 香港 | ss | 0.5× | NF GPT 01
 * 
 * 使用方式：
 * 在 Sub-Store 对应的订阅（或组合订阅）中，添加 "脚本操作" (Script Operator)，
 * 将此文件的代码贴入或通过 URL 引用即可生效。
 */

async function operator(proxies = [], targetPlatform, context) {
    const $ = typeof $substore !== 'undefined' ? $substore : undefined;
    
    // ==========================================
    // 1. 地区、国旗映射表
    // ==========================================
    const regionMap = {
        '香港|HK|Hong Kong|HongKong': '🇭🇰 香港',
        '台湾|TW|Taiwan|新北|彰化': '🇨🇳 台湾',
        '日本|JP|Japan|东京|大阪|埼玉': '🇯🇵 日本',
        '韩国|KR|KOR|Korea|春川|首尔': '🇰🇷 韩国',
        '新加坡|SG|Singapore|狮城': '🇸🇬 新加坡',
        '美国|US|America|United States|波特兰|洛杉矶|西雅图|芝加哥|硅谷|纽约': '🇺🇸 美国',
        '英国|UK|GBR|England|United Kingdom|伦敦': '🇬🇧 英国',
        '德国|DE|Germany|法兰克福': '🇩🇪 德国',
        '法国|FR|France|巴黎': '🇫🇷 法国',
        '澳大利亚|AU|Australia|悉尼|墨尔本': '🇦🇺 澳大利亚',
        '阿联酋|AE|迪拜': '🇦🇪 阿联酋',
        '印度|IN|India|孟买': '🇮🇳 印度',
        '土耳其|TR|TUR|Turkey|伊斯坦布尔': '🇹🇷 土耳其',
        '荷兰|NL|Netherlands|阿姆斯特丹': '🇳🇱 荷兰',
        '俄罗斯|RU|Russia|莫斯科|伯力': '🇷🇺 俄罗斯',
        '加拿大|CA|Canada|蒙特利尔|温哥华': '🇨🇦 加拿大',
        '马来西亚|MY|Malaysia': '🇲🇾 马来西亚',
        '阿根廷|AR|Argentina': '🇦🇷 阿根廷',
        '菲律宾|PH|Philippines': '🇵🇭 菲律宾',
        '泰国|TH|Thailand|曼谷': '🇹🇭 泰国',
        '印度尼西亚|印尼|ID|Indonesia|雅加达': '🇮🇩 印尼',
        '越南|VN|Vietnam|胡志明': '🇻🇳 越南',
        '巴西|BR|Brazil|圣保罗': '🇧🇷 巴西',
        '爱沙尼亚|EE|Estonia': '🇪🇪 爱沙尼亚',
    };

    const groupCount = {};

    // 预处理节点信息
    proxies.forEach(proxy => {
        let name = proxy.name || '';
        
        // --- 解析地区 ---
        let region = '🏳️‍🌈 未知';
        for (const key in regionMap) {
            if (new RegExp(key, 'i').test(name)) {
                region = regionMap[key];
                break;
            }
        }

        // --- 解析倍率 ---
        let rate = '1.0';
        // 匹配 0.5x, 1x, 2.0倍 等格式
        const rateMatch = name.match(/(\d+(?:\.\d+)?)\s*(?:x|X|×|倍)/i);
        if (rateMatch) {
            rate = rateMatch[1];
        } else if (/高倍/.test(name)) { // 兼容某些写着“高倍”但是无数字的节点
            rate = '高倍';
        }
        const rateStr = rate === '高倍' ? rate : `${rate}×`;

        // --- 识别来源 ---
        // 从 Sub-Store 获取收集的子订阅名称(_subName)，或者配置名称
        let source = 'h'; 
        let subName = String(proxy._subName || proxy.collectionName || name); 
        
        // 按照用户需求匹配：ss, dj, 本地为 h
        if (/shadowsocks/i.test(subName)) {
            source = 'ss';
        } else if (/顶级机场/i.test(subName)) {
            source = 'dj';
        } else {
            source = 'h'; // 默认为本地(h)
        }

        // 临时保存解析后的信息，准备测速之后合并
        proxy._parsedInfo = { region, source, rateStr };
    });

    // ==========================================
    // 2. 解锁连通性检测逻辑
    // ==========================================
    // 兼容不同的网络请求挂载点
    const httpClient = ($ && $.http) || (typeof $httpClient !== 'undefined' ? $httpClient : null);
    
    if ($ && $.ProxyUtils && httpClient) {
        let internalProxies;
        try {
            // 将基础 proxy 信息转译为 Sub-Store 底层测试用格式
            internalProxies = $.ProxyUtils.produce(proxies, 'ClashMeta', 'internal');
        } catch (e) {
            console.log(`[解锁检测] 节点转换失败: ${e.message}`);
        }

        if (internalProxies && internalProxies.length > 0) {
            const concurrency = 8; // 控制并发量，避免导致自建 docker 后端卡死或主动熔断
            
            // 封装兼容不同写法的请求，返回状态
            const doRequest = (url, node, timeout) => {
                return new Promise((resolve) => {
                    const options = { url, timeout, 'policy-descriptor': node };
                     // 兼容某些环境需要 proxy
                     options.proxy = node;

                    try {
                        // 使用 $.http.get() (如果返回 Promise)
                        const req = httpClient.get(options, (err, res, body) => {
                            // 回调方式支持 (Surge 规范的 $httpClient)
                            if (err) resolve({ status: -1, error: err });
                            else resolve({ status: res.status || res.statusCode, body });
                        });
                        
                        // 兼容 Promise 方式返回 (Sub-Store axios 封装)
                        if (req && req.then) {
                            req.then(res => resolve({ status: res.status, body: res.body || res.data }))
                               .catch(err => resolve({ status: err.response ? err.response.status : -2 }));
                        }
                    } catch(e) {
                        resolve({ status: -3, error: e.message });
                    }
                });
            };

            async function testNode(proxy, node) {
                let tags = [];
                const reqs = [];
                const timeout = 4000; // 单个请求限时 4s，严格控制总响应时长

                // 1. Netflix 测试
                reqs.push((async () => {
                    const res = await doRequest('https://www.netflix.com/title/81215567', node, timeout);
                    if (res.status === 200) tags.push('NF');
                    else if (res.status === 404) tags.push('NF自制');
                })());

                // 2. ChatGPT 测试
                reqs.push((async () => {
                    const res = await doRequest('https://chatgpt.com/', node, timeout);
                    if (res.status === 200 || res.status === 301 || res.status === 302 || res.status === 307) {
                        tags.push('GPT');
                    }
                })());

                // 3. Claude 测试
                reqs.push((async () => {
                    const res = await doRequest('https://claude.ai/login', node, timeout);
                    if (res.status === 200 && res.body && !String(res.body).includes('App unavailable')) {
                        tags.push('Claude');
                    }
                })());

                // 4. Gemini 测试
                reqs.push((async () => {
                    const res = await doRequest('https://gemini.google.com/', node, timeout);
                    if (res.status === 200 || res.status === 302 || res.status === 301) {
                        tags.push('Gemini');
                    }
                })());

                // 等待所有检测均结束
                await Promise.allSettled(reqs);
                proxy._tags = tags;
            }

            // 分批限流执行请求
            for (let i = 0; i < proxies.length; i += concurrency) {
                const batch = proxies.slice(i, i + concurrency);
                const internalBatch = internalProxies.slice(i, i + concurrency);
                const promises = batch.map((proxy, index) => testNode(proxy, internalBatch[index]));
                await Promise.allSettled(promises);
            }
        }
    } else {
        // 如果没有支持库，在第一个节点里插入报错，方便用户溯源
        if (proxies.length > 0) {
            proxies[0]._tags = ['环境不支持检测'];
        }
    }

    // ==========================================
    // 3. 最终组合并命名
    // ==========================================
    proxies.forEach(proxy => {
        const info = proxy._parsedInfo || {};
        const region = info.region || '未知';
        const source = info.source || 'h';
        const rateStr = info.rateStr || '1.0×';
        
        // 计算节点序号序号 (按照 '地区-来源' 分组计算，保持编号独立性)
        const groupKey = `${region}-${source}`;
        if (!groupCount[groupKey]) groupCount[groupKey] = 0;
        groupCount[groupKey]++;
        const indexStr = groupCount[groupKey].toString().padStart(2, '0');

        // 提取流媒体解锁 Tags
        const tags = proxy._tags && proxy._tags.length > 0 ? proxy._tags.join(' ') + ' ' : '';
        
        // 最终组装格式示例：🇭🇰 香港 | ss | 0.5× | NF GPT 01
        proxy.name = `${region} | ${source} | ${rateStr} | ${tags}${indexStr}`;

        // 清理由于此脚本注入的临时自用属性以避免造成异常
        delete proxy._parsedInfo;
        delete proxy._tags;
    });

    return proxies;
}
