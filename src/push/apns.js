// APNs（iOS）—— 用户中继不直接持作者的 .p8（普通用户拿不到 Apple 凭据），
// 而是把 iOS 推送转发到作者运营的「中心 APNs 中转」（nuojiji-apns-relay）代发。
//
// 环境变量：
//   APNS_RELAY_URL     —— 中心中转地址，如 https://nuojiji-apns-relay.xxx.workers.dev
//   APNS_RELAY_SECRET  —— 与中转一致的鉴权密钥
//   都没配 → iOS 推送不发（靠手机轮询兜底）。
//
// 订阅 entry：{ channel:'apns', token:'<device hex token>' }

function getRelayCfg(env) {
    const g = (k) => env?.[k] || (typeof process !== 'undefined' ? process.env?.[k] : undefined);
    const url = (g('APNS_RELAY_URL') || '').replace(/\/+$/, '');
    const secret = g('APNS_RELAY_SECRET') || '';
    if (!url || !secret) return null;
    return { url, secret };
}

/**
 * 转发一条 iOS 推送到中心中转。
 * @param subscription { channel:'apns', token:'<hex>' }
 * 返回 { ok, gone, reason }。gone:true（中转返 410）表示 token 失效，调用方删订阅。
 */
export async function sendApns(env, subscription, payload) {
    const cfg = getRelayCfg(env);
    if (!cfg) return { ok: false, gone: false, reason: 'apns-relay-not-configured' };
    const token = subscription?.token || subscription?.sub?.token;
    if (!token) return { ok: false, gone: true, reason: 'no-device-token' };
    try {
        const res = await fetch(`${cfg.url}/push`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'authorization': `Bearer ${cfg.secret}` },
            body: JSON.stringify({
                deviceToken: token,
                title: payload.title, body: payload.body,
                charId: payload.charId, userId: payload.userId, kind: payload.kind,
            }),
        });
        if (res.status === 200) return { ok: true, gone: false };
        if (res.status === 410) return { ok: false, gone: true, reason: 'token gone (relay)' };
        const txt = await res.text().catch(() => '');
        return { ok: false, gone: false, reason: `apns-relay HTTP ${res.status}: ${txt.slice(0, 150)}` };
    } catch (e) {
        return { ok: false, gone: false, reason: e?.message || String(e) };
    }
}
