import { NextRequest, NextResponse } from 'next/server';

// 强制动态模式
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const bodyFile = formData.get('body_images') as File; // 注意前端传过来的是 body_images
    const faceFile = formData.get('face_image') as File;

    if (!bodyFile || !faceFile) {
      return NextResponse.json({ error: '请上传图片' }, { status: 400 });
    }

    console.log(`[Next.js] 收到图片，正在转发给 n8n...`);

    // 构建发给 n8n 的数据
    const n8nFormData = new FormData();
    // 这里定义的 key 是 n8n Webhook 节点里会收到的变量名
    n8nFormData.append('body_image', bodyFile); 
    n8nFormData.append('face_image', faceFile); 

    // 获取 n8n 地址
    const n8nUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nUrl) throw new Error("未配置 N8N_WEBHOOK_URL");

    // 发送给 n8n
    const n8nRes = await fetch(n8nUrl, {
      method: 'POST',
      body: n8nFormData,
    });

    if (!n8nRes.ok) {
      const errText = await n8nRes.text();
      throw new Error(`n8n 报错: ${n8nRes.status} ${errText}`);
    }

    // --- 替换成这样 ---
    const responseText = await n8nRes.text(); // 先拿纯文本
    console.log("[Next.js] n8n 原始返回内容:", responseText); // 打印出来看看是啥！

    if (!responseText) {
        throw new Error("n8n 返回了空内容 (可能工作流中途断了)");
    }

    let n8nData;
    try {
        n8nData = JSON.parse(responseText);
    } catch (e) {
        throw new Error(`n8n 返回的不是 JSON，而是: ${responseText.slice(0, 100)}...`);
    }

    // 解析 n8n 返回的图片链接
    // 假设 n8n 最终返回的 JSON 字段叫 result
    const finalUrl = n8nData.result || n8nData.output || n8nData.url || n8nData.output_url;

    if (!finalUrl) {
       throw new Error("n8n 执行成功，但未返回图片 URL");
    }

    // 保持前端需要的格式 { results: [...] }
    return NextResponse.json({ results: [finalUrl] });

  } catch (error: any) {
    console.error("[Next.js] 错误:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}