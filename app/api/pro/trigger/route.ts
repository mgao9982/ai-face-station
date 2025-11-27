import { NextRequest, NextResponse } from 'next/server';

// 强制动态模式，避免缓存干扰
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // 1. 解析前端发来的 JSON (不再是 formData 了)
    const { body_url, face_url } = await req.json();

    // 2. 简单校验
    if (!body_url || !face_url) {
      return NextResponse.json({ error: '缺少图片链接 (Missing URLs)' }, { status: 400 });
    }

    console.log("[Pro Trigger] 收到 Blob 链接:");
    console.log("Body:", body_url);
    console.log("Face:", face_url);

    // 3. 获取 PRO 版 n8n 地址
    // ⚠️ 确保你在 .env.local 里配了 N8N_PRO_WEBHOOK_URL
    const n8nUrl = process.env.N8N_PRO_WEBHOOK_URL;
    
    if (!n8nUrl) {
      throw new Error("未配置 N8N_PRO_WEBHOOK_URL，请检查 .env.local");
    }

    // 4. 转发给 n8n (发送 JSON)
    const n8nRes = await fetch(n8nUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        body_url: body_url,
        face_url: face_url,
        // 你也可以在这里加 seed，或者让 n8n 自己生成
        seed: Math.floor(Math.random() * 1000000000)
      }),
    });

    if (!n8nRes.ok) {
      const errText = await n8nRes.text();
      throw new Error(`n8n 报错 (${n8nRes.status}): ${errText}`);
    }

    // 5. 解析 n8n 返回的 taskId (带调试日志版)
    const responseText = await n8nRes.text();
    console.log("[Pro Trigger] n8n 原始响应:", responseText);

    if (!responseText) {
        throw new Error("n8n 返回了空内容，请检查 Webhook 节点的 Respond 设置");
    }

    let n8nData;
    try {
        n8nData = JSON.parse(responseText);
    } catch (e) {
        throw new Error(`n8n 返回的不是 JSON: ${responseText}`);
    }
    
    // 兼容处理：有时候 n8n 返回结构可能不同，这里做个保险
    const taskId = n8nData.taskId || n8nData.data?.taskId;

    if (!taskId) {
      throw new Error(`n8n 未返回 taskId。原始响应: ${JSON.stringify(n8nData)}`);
    }

    console.log("[Pro Trigger] 任务创建成功 ID:", taskId);

    // 6. 返回给前端，开始轮询
    return NextResponse.json({ taskId: taskId });

  } catch (error: any) {
    console.error("[Pro Trigger] Error:", error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}