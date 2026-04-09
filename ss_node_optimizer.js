/**
 * Sub-Store 节点格式化精简版（纯净重命名）
 * 
 * 功能：
 * 1. 规范化命名：提取地区国旗、判断来源(ss/dj/h)、提取倍率。
 * 2. 编号排版：按地区与来源自动生成连续编号。
 * 3. 最终输出格式：🇭🇰 香港 | ss | 0.5× | 01
 */

async function operator(proxies = [], targetPlatform, context) {
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
        '瑞典|SE|Sweden|斯德哥尔摩': '🇸🇪 瑞典',
        '墨西哥|MX|Mexico|克雷塔罗': '🇲🇽 墨西哥',
        '波兰|PL|POL|Poland|华沙': '🇵🇱 波兰',
        '南非|ZA|South Africa|非洲|约翰内斯堡': '🇿🇦 南非',
        '西班牙|ES|ESP|Spain|马德里': '🇪🇸 西班牙',
        '冰岛|IS|ISL|Iceland|雷克雅未克': '🇮🇸 冰岛',
        '丹麦|DK|DNK|Denmark|哥本哈根': '🇩🇰 丹麦'
    };

    const groupCount = {};

    // --- 过滤无效节点与不安全协议 ---
    proxies = proxies.filter(proxy => {
        const n = proxy.name || '';
        // 1. 匹配日期 (如2026-05-09), 流量 (如 71.42G / 1000.00G), 及其它通知用语
        if (/(到期|有效|剩余|过期|流量|测试|更新|套餐|官网|群|联系客服|通知|\d{4}[-/]\d{2}[-/]\d{2}|\b\d+(\.\d+)?\s*[MGT]B?\s*[/｜|]\s*\d+(\.\d+)?\s*[MGT]B?)/i.test(n)) {
            return false;
        }

        // 2. 剔除 skip-cert-verify 为 true 的节点（规避中间人风险或错误配置）
        if (proxy['skip-cert-verify'] === true || String(proxy['skip-cert-verify']).toLowerCase() === 'true') {
            return false;
        }

        // 3. 剔除未采用 AEAD 加密的旧版 SS 节点（防主动探测）
        if (proxy.type === 'ss' || proxy.type === 'shadowsocks') {
            const cipher = proxy.cipher || proxy.method || proxy.encryptMethod || '';
            // 现代 AEAD 加密通常标有 gcm 或 poly1305 (如 aes-128-gcm, chacha20-ietf-poly1305)
            if (!/gcm|poly1305/i.test(cipher)) {
                return false;
            }
        }

        return true;
    });

    // --- 根据 Server 地址去重，按协议优先级判定去留 ---
    const protocolPriority = {
        'hysteria2': 100,
        'hysteria': 95,
        'vless': 90,
        'trojan': 80,
        'ss': 70,
        'shadowsocks': 70,
        'ssr': 60,
        'shadowsocksr': 60,
        'vmess': 50
    };
    
    // 用于记录每个 server 对应的最高优先级及其代理实例
    const uniqueServers = new Map();

    proxies.forEach(proxy => {
        const server = proxy.server;
        if (!server) return; 

        const type = String(proxy.type || '').toLowerCase();
        const priority = protocolPriority[type] || 10; 

        if (uniqueServers.has(server)) {
            const existing = uniqueServers.get(server);
            // 遇到冲突时，保留更高优先级的节点
            if (priority > existing.priority) {
                uniqueServers.set(server, { priority, proxy });
            }
        } else {
            uniqueServers.set(server, { priority, proxy });
        }
    });
    
    // 依照原数组顺序，筛出被保留下的节点
    const dedupedProxies = [];
    proxies.forEach(proxy => {
        if (!proxy.server) {
            dedupedProxies.push(proxy);
            return;
        }
        // 如果当前节点等同于 Map 中选出的该冲突 IP 的最优解，则予以保留
        if (uniqueServers.get(proxy.server).proxy === proxy) {
            dedupedProxies.push(proxy);
        }
    });
    proxies = dedupedProxies;

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
        // 第一种匹配：0.5x, 2倍；第二种匹配：倍率:1, 流量倍率：1.5
        const rateMatch = name.match(/(\d+(?:\.\d+)?)\s*(?:x|X|×|倍)/i) || name.match(/倍率[:：\s]*(\d+(?:\.\d+)?)/i);
        if (rateMatch) {
            rate = rateMatch[1];
        } else if (/高倍/.test(name)) {
            rate = '高倍';
        }
        const rateStr = rate === '高倍' ? rate : `${rate}×`;

        // --- 识别来源 ---
        let source = 'h'; 
        let subName = String(proxy._subName || proxy.collectionName || name); 
        
        if (/shadowsocks/i.test(subName)) {
            source = 'ss';
        } else if (/顶级机场/i.test(subName)) {
            source = 'dj';
        } else {
            source = 'h';
        }

        // --- 提取特殊配置后缀备注 ---
        let tags = [];
        // 智能捕捉类似 "TK专线"、"特殊流媒体"、"IPLC" 标志，以及 "FW"、"V6"、"VIP" 等
        const tagMatches = name.match(/[a-zA-Z0-9\u4e00-\u9fa5]*(?:专线|流媒体|三网高速|三网|中转|中继|直连|原生|家宽|优化|游戏|IEPL|IPLC|BGP|FW|V6|IPv6|VIP)/gi);
        if (tagMatches) {
            tags = [...new Set(tagMatches)];
        }
        const tagStr = tags.length > 0 ? ` | ${tags.join(' ')}` : '';

        // --- 组合命名 ---
        const groupKey = `${region}-${source}`;
        if (!groupCount[groupKey]) groupCount[groupKey] = 0;
        groupCount[groupKey]++;
        const indexStr = groupCount[groupKey].toString().padStart(2, '0');

        proxy.name = `${region} | ${source} | ${rateStr} | ${indexStr}${tagStr}`;
    });

    // ==========================================
    // 4. 从旁路 Python 引擎拉取解锁缓存标签
    // ==========================================
    try {
        const args = (typeof $arguments !== 'undefined' && $arguments) ? $arguments : {};
        const baseUrl = args.api_url || args.apiUrl || 'http://192.168.100.191:8000';
        const apiUrl = baseUrl.endsWith('/api/cache') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/api/cache`;

        let cacheData = null;
        if (typeof axios !== 'undefined') {
            const response = await axios.get(apiUrl, { timeout: 3000 });
            cacheData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        } else if (typeof $httpClient !== 'undefined') {
            const cacheResp = await new Promise((resolve) => {
                $httpClient.get({ url: apiUrl, timeout: 3000 }, (err, res, body) => {
                    if (err) resolve(null);
                    else resolve(body);
                });
            });
            if (cacheResp) cacheData = typeof cacheResp === 'string' ? JSON.parse(cacheResp) : cacheResp;
        } else if (typeof fetch !== 'undefined') {
            const response = await fetch(apiUrl, { signal: AbortSignal.timeout(3000) });
            cacheData = await response.json();
        } else {
            console.log("[Python联动] 无法获取缓存：缺少 axios / $httpClient / fetch");
        }

        if (cacheData && cacheData.status === 'ok' && cacheData.data) {
            const serverResultMap = cacheData.data;
            proxies.forEach(proxy => {
                const srv = proxy.server;
                if (srv && serverResultMap[srv]) {
                    const unlockTags = serverResultMap[srv];
                    if (unlockTags && unlockTags.length > 0) {
                        proxy.name = proxy.name + " | " + unlockTags.join(' ');
                    }
                }
            });
        }
    } catch (e) {
        console.log("[Python联动] 获取 AI 测流缓存失败: " + e.message);
    }

    return proxies;
}
