'use client';
import { useState, useRef, useEffect } from 'react';
import imageCompression from 'browser-image-compression';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface TaskItem {
  id: string;
  file: File;
  preview: string;
  taskId?: string;
  status: 'waiting' | 'uploading' | 'submitting' | 'running' | 'success' | 'failed' | 'cancelled';
  resultUrl?: string;
  log: string;
  startTime?: number;
  duration?: string;
}

export default function ProPage() {
  const [faceFile, setFaceFile] = useState<File | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isZipping, setIsZipping] = useState(false);
  
  const faceInputRef = useRef<HTMLInputElement>(null);
  const bodyInputRef = useRef<HTMLInputElement>(null);

  // ⚡️ 升级：使用 Task ID 作为 Key，而不是数字索引
  const intervalRefs = useRef<{ [key: string]: NodeJS.Timeout }>({});

  const formatDuration = (ms: number) => (ms / 1000).toFixed(1) + 's';

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => ['success', 'failed', 'cancelled'].includes(t.status)).length;
  const successTasks = tasks.filter(t => t.status === 'success');
  const progressPercent = totalTasks === 0 ? 0 : (completedTasks / totalTasks) * 100;
  const isGlobalRunning = tasks.some(t => ['running', 'submitting', 'uploading'].includes(t.status));

  useEffect(() => {
    return () => {
      Object.values(intervalRefs.current).forEach(clearInterval);
    };
  }, []);

  const uploadToBlob = async (file: File): Promise<string> => {
    const options = { maxSizeMB: 2, maxWidthOrHeight: 1920, useWebWorker: true };
    const compressedFile = await imageCompression(file, options);
    const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
    const response = await fetch(`/api/upload?filename=${safeName}`, { method: 'POST', body: compressedFile });
    if (!response.ok) throw new Error('上传失败');
    const blob = await response.json();
    return blob.url;
  };

  const triggerTask = async (bodyUrl: string, faceUrl: string) => {
    const res = await fetch('/api/pro/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body_url: bodyUrl, face_url: faceUrl }),
    });
    return await res.json();
  };

  // 🛑 停止任务 (按 ID)
  const handleStop = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (intervalRefs.current[id]) {
      clearInterval(intervalRefs.current[id]);
      delete intervalRefs.current[id];
    }

    setTasks(prev => prev.map(t => 
      t.id === id ? { ...t, status: 'cancelled', log: '已终止 / STOPPED' } : t
    ));

    if (task.taskId) {
      try {
        fetch('/api/cancel', {
          method: 'POST',
          body: JSON.stringify({ taskId: task.taskId })
        });
      } catch (e) { console.error(e); }
    }
  };

  // 🗑️ 删除任务 (新增功能)
  const handleRemoveTask = (id: string) => {
    // 1. 如果正在运行，先停止
    if (intervalRefs.current[id]) {
        clearInterval(intervalRefs.current[id]);
        delete intervalRefs.current[id];
    }
    // 2. 从列表移除
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  // 🗑️ 删除脸部图 (新增功能)
  const handleRemoveFace = (e: React.MouseEvent) => {
    e.stopPropagation(); // 防止触发上传点击
    setFaceFile(null);
    if (faceInputRef.current) faceInputRef.current.value = ''; // 清空 input，允许重复选同一张
  };

  const handleBodyUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newTasks = Array.from(e.target.files).map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        preview: URL.createObjectURL(file),
        status: 'waiting' as const,
        log: '就绪 / READY',
      }));
      setTasks(prev => [...prev, ...newTasks]);
    }
  };

  const handleFaceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setFaceFile(e.target.files[0]);
  };

  // 轮询 (升级为按 ID 更新)
  const pollTask = async (id: string, taskId: string) => {
    if (intervalRefs.current[id]) clearInterval(intervalRefs.current[id]);

    const intervalId = setInterval(async () => {
      try {
        const res = await fetch('/api/async/status', { method: 'POST', body: JSON.stringify({ taskId }) });
        const data = await res.json();

        setTasks(prev => prev.map(task => {
          if (task.id !== id) return task;
          
          if (task.status === 'cancelled') {
            clearInterval(intervalId);
            return task;
          }

          if (data.status === 'SUCCESS') {
            clearInterval(intervalId);
            delete intervalRefs.current[id];
            const timeTaken = task.startTime ? Date.now() - task.startTime : 0;
            return { ...task, status: 'success', resultUrl: data.output, log: '完成 / DONE', duration: formatDuration(timeTaken) };
          } else if (data.status === 'FAILED') {
            clearInterval(intervalId);
            delete intervalRefs.current[id];
            return { ...task, status: 'failed', log: `ERR: ${data.msg || 'Fail'}` };
          }
          return { ...task, status: 'running', log: '处理中 / PROCESSING' };
        }));
      } catch (e) { console.error(e); }
    }, 3000);

    intervalRefs.current[id] = intervalId;
  };

  const handleStart = async () => {
    if (tasks.length === 0 || !faceFile) return alert('请先上传图片！\nPlease upload images first.');
    window.scrollTo({ top: 500, behavior: 'smooth' });
    
    const now = Date.now();
    setTasks(prev => prev.map(t => t.status === 'waiting' ? { ...t, status: 'uploading', log: '准备中 / PREPARING', startTime: now } : t));

    let faceUrl = '';
    try {
        faceUrl = await uploadToBlob(faceFile);
    } catch (e) { return alert('脸部图上传失败'); }

    tasks.forEach(async (task) => { // 这里不再需要 index
      if (task.status !== 'waiting' && task.log !== '准备中 / PREPARING') return;

      try {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, log: '上传中 / UPLOADING' } : t));
        const bodyUrl = await uploadToBlob(task.file);

        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'submitting', log: '启动中 / INITIATING' } : t));
        const data = await triggerTask(bodyUrl, faceUrl);

        if (data.taskId) {
          setTasks(prev => prev.map(t => t.id === task.id ? { ...t, taskId: data.taskId, status: 'running', log: '排队中 / QUEUED' } : t));
          pollTask(task.id, data.taskId); // 传入 ID
        } else { throw new Error('NO ID'); }
      } catch (e: any) {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'failed', log: '失败 / FAIL' } : t));
      }
    });
  };

  const handleRegenerate = async (id: string) => { // 传入 ID
    if (!faceFile) return alert('脸部图丢失');
    
    if (intervalRefs.current[id]) clearInterval(intervalRefs.current[id]);

    const now = Date.now();
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'uploading', log: '重试中 / RETRYING', resultUrl: undefined, startTime: now } : t));
    
    const targetTask = tasks.find(t => t.id === id);
    if (!targetTask) return;

    try {
      const bodyUrl = await uploadToBlob(targetTask.file);
      const faceUrl = await uploadToBlob(faceFile);
      const data = await triggerTask(bodyUrl, faceUrl);
      if (data.taskId) {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, taskId: data.taskId, status: 'running', log: '排队中 / QUEUED' } : t));
        pollTask(id, data.taskId);
      }
    } catch (e) { console.error(e); }
  };

  const handleDownloadAll = async () => {
    if (successTasks.length === 0) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("face_swap_results");
      await Promise.all(successTasks.map(async (task, i) => {
        if (task.resultUrl) {
            const response = await fetch(task.resultUrl);
            const blob = await response.blob();
            folder?.file(`Result_${i + 1}.png`, blob);
        }
      }));
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "face_swap_batch.zip");
    } catch (e) { alert('下载失败'); } 
    finally { setIsZipping(false); }
  };

  return (
    <div className="min-h-screen bg-[#E0E5EC] text-[#2D3436] font-sans selection:bg-black selection:text-white overflow-x-hidden relative">
      
      <div className="fixed top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 z-50"></div>
      <div className="fixed top-4 right-4 z-50">
          <span className="bg-black text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-widest">PRO / 异步版</span>
      </div>

      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-white blur-[150px] opacity-60 pointer-events-none"></div>
      <div className="fixed bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-[#C3CBD6] blur-[150px] opacity-40 pointer-events-none"></div>

      <main className="relative z-10 max-w-[1600px] mx-auto px-6 py-12 flex flex-col lg:flex-row items-center justify-center min-h-screen gap-12 lg:gap-24">
        
        {/* 左侧：身体图列表 */}
        <div className="lg:w-1/4 w-full flex flex-col gap-4 order-2 lg:order-1 h-[600px]">
          <div className="flex justify-between items-end border-b border-black/10 pb-4 mb-2">
            <div>
                <h2 className="text-4xl font-light tracking-tighter leading-none">BODY<br/>SOURCE</h2>
                <p className="text-xs font-bold text-gray-400 tracking-widest mt-2">身体素材源</p>
            </div>
            <div className="text-[10px] font-bold tracking-widest opacity-40 text-right leading-relaxed">
              支持多选<br/>MULTI-SELECT
            </div>
          </div>

          <div onClick={() => bodyInputRef.current?.click()} className="h-28 w-full rounded-2xl bg-white/30 backdrop-blur-md border border-white/50 flex items-center justify-between px-8 cursor-pointer hover:bg-white/60 transition duration-500 group shadow-lg shadow-black/5">
            <div className="flex flex-col gap-1">
                <span className="text-sm font-bold tracking-widest opacity-80 group-hover:opacity-100">添加图片</span>
                <span className="text-[10px] opacity-40 tracking-[0.2em]">ADD IMAGES</span>
            </div>
            <div className="w-10 h-10 rounded-full border border-black/10 flex items-center justify-center group-hover:bg-black group-hover:text-white transition text-xl font-thin">+</div>
            <input ref={bodyInputRef} type="file" multiple className="hidden" onChange={handleBodyUpload} />
          </div>

          <div className="space-y-3 max-h-full overflow-y-auto pr-2 custom-scrollbar flex-1 pt-2">
            {tasks.map((task) => (
              <div key={task.id} className="relative flex items-center gap-4 p-3 rounded-xl bg-white/40 backdrop-blur-sm border border-white/40 overflow-hidden group hover:bg-white/60 transition">
                {(task.status === 'running' || task.status === 'uploading' || task.status === 'submitting') && (
                   <div className="absolute bottom-0 left-0 h-[2px] bg-black/80 animate-progress w-full"></div>
                )}
                
                <img src={task.preview} className="w-12 h-12 rounded-lg object-cover grayscale opacity-80" />
                <div className="flex-1 min-w-0 z-10">
                  <div className="text-[10px] font-mono opacity-50 truncate">{task.file.name}</div>
                  <div className="flex justify-between items-center mt-1">
                    <span className={`text-[9px] font-bold tracking-widest px-2 py-0.5 rounded ${
                      task.status === 'success' ? 'bg-green-200 text-green-800' : 
                      task.status === 'failed' ? 'bg-red-200 text-red-800' :
                      task.status === 'cancelled' ? 'bg-gray-300 text-gray-600' :
                      'bg-white/50'
                    }`}>
                      {task.log}
                    </span>
                  </div>
                </div>
                
                {/* 操作区：停止或删除 */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-2 opacity-0 group-hover:opacity-100 transition z-50">
                    {/* 停止按钮 */}
                    {(task.status === 'running' || task.status === 'submitting' || task.status === 'uploading') && (
                        <button 
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleStop(task.id); }}
                            className="w-8 h-8 bg-white/80 hover:bg-red-500 hover:text-white text-red-500 rounded-full flex items-center justify-center shadow-sm backdrop-blur-sm"
                            title="终止生成"
                        >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>
                        </button>
                    )}
                    
                    {/* 🗑️ 删除按钮 (新增) */}
                    {/* 只有不在运行中，或者已取消时才显示删除，防止逻辑冲突 */}
                    {(task.status === 'waiting' || task.status === 'success' || task.status === 'failed' || task.status === 'cancelled') && (
                        <button 
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemoveTask(task.id); }}
                            className="w-8 h-8 bg-white/80 hover:bg-red-600 hover:text-white text-gray-400 rounded-full flex items-center justify-center shadow-sm backdrop-blur-sm"
                            title="移除任务"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 中间：胶囊核心 */}
        <div className="lg:w-1/3 w-full flex flex-col items-center order-1 lg:order-2 relative">
          <div className="relative w-[320px] h-[520px] rounded-[160px] bg-white/10 backdrop-blur-2xl border border-white/40 shadow-2xl shadow-black/10 flex flex-col items-center justify-between p-4 overflow-hidden group">
            <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/40 to-transparent pointer-events-none"></div>

            {/* 脸部图区域 (带删除按钮) */}
            <div onClick={() => faceInputRef.current?.click()} className="relative mt-6 w-[260px] h-[260px] rounded-full bg-black/5 border border-white/20 overflow-hidden cursor-pointer transition duration-700 hover:scale-105">
              {faceFile ? (
                <>
                    <img src={URL.createObjectURL(faceFile)} className="w-full h-full object-cover" />
                    {/* 🗑️ 脸部图删除按钮 */}
                    <button 
                        onClick={handleRemoveFace}
                        className="absolute top-4 right-4 w-8 h-8 bg-black/50 hover:bg-red-500 text-white rounded-full flex items-center justify-center transition z-50"
                        title="移除脸部图"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-black/30">
                    <span className="text-4xl font-thin mb-2">+</span>
                    <span className="text-xs font-bold tracking-widest">上传脸部</span>
                    <span className="text-[8px] opacity-60 mt-1 tracking-[0.2em]">UPLOAD FACE</span>
                </div>
              )}
              <input ref={faceInputRef} type="file" className="hidden" onChange={handleFaceUpload} />
            </div>

            <div className="text-center z-10 mt-4 w-full px-8">
              <div className="text-[10px] tracking-[0.3em] opacity-50 mb-2 font-bold">FACE REFERENCE</div>
              <h1 className="text-3xl font-light tracking-tighter text-black mix-blend-overlay mt-1">脸部参考</h1>
              
              <div className="mt-6 w-full">
                {isGlobalRunning ? (
                  <div className="space-y-2 animate-fade-in">
                    <div className="flex justify-between text-[9px] font-bold tracking-widest opacity-60 px-2">
                      <span>处理进度 / PROCESSING</span>
                      <span>{completedTasks} / {totalTasks}</span>
                    </div>
                    <div className="h-1 w-full bg-black/5 rounded-full overflow-hidden">
                      <div className="h-full bg-black transition-all duration-500 ease-out shadow-[0_0_10px_rgba(0,0,0,0.3)]" style={{ width: `${progressPercent}%` }}></div>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] opacity-40 leading-loose tracking-wider">
                    请上传一张清晰的人脸照片<br/>作为替换的目标
                  </div>
                )}
              </div>
            </div>

            <button onClick={handleStart} disabled={isGlobalRunning} className={`mb-8 text-white w-[200px] h-12 rounded-full flex items-center justify-center gap-2 shadow-lg transition duration-300 z-20 ${isGlobalRunning ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#2D3436] hover:scale-105'}`}>
              <div className="flex flex-col items-center leading-none">
                  <span className="text-xs font-bold tracking-widest">{isGlobalRunning ? '处理中...' : '开始生成'}</span>
                  <span className="text-[8px] opacity-60 tracking-widest">{isGlobalRunning ? 'BUSY' : 'GENERATE'}</span>
              </div>
            </button>
          </div>
        </div>

        {/* 右侧：结果画廊 */}
        <div className="lg:w-1/3 w-full h-[600px] order-3 relative">
           <div className="absolute -top-10 right-0 text-[120px] font-thin text-black/5 leading-none pointer-events-none">02</div>
           
           <div className="flex justify-between items-start mb-6 border-l-2 border-black pl-4">
              <div>
                  <h2 className="text-2xl font-light tracking-tight">OUTPUT</h2>
                  <h3 className="text-sm font-bold text-gray-400 tracking-widest">结果画廊</h3>
              </div>
              {successTasks.length > 0 && (
                <button 
                  onClick={handleDownloadAll} 
                  disabled={isZipping}
                  className="bg-white border border-gray-300 px-4 py-2 rounded-full text-[10px] font-bold tracking-widest hover:bg-black hover:text-white transition flex items-center gap-2 shadow-sm"
                >
                   {isZipping ? '打包中...' : '一键下载 / ALL'}
                </button>
              )}
           </div>
           
           <div className="grid grid-cols-2 gap-4 h-full overflow-y-auto pb-20 content-start custom-scrollbar">
              {tasks.filter(t => t.resultUrl).map((task) => (
                <div key={task.id} className="relative aspect-[3/4] bg-white p-2 rounded-2xl shadow-md group transition hover:-translate-y-1">
                   <div className="w-full h-full rounded-xl overflow-hidden relative bg-black/5">
                      <img src={task.resultUrl} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition duration-300 flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
                         {task.duration && <div className="text-white text-xs font-mono border border-white/30 px-2 py-1 rounded-full">{task.duration}</div>}
                         <div className="flex gap-2">
                            <button onClick={() => handleRegenerate(task.id)} className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition" title="重绘">↺</button>
                            <a href={task.resultUrl} target="_blank" download className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition" title="下载">↓</a>
                         </div>
                      </div>
                   </div>
                </div>
              ))}
              {tasks.filter(t => t.resultUrl).length === 0 && (
                  <div className="col-span-2 h-64 border border-dashed border-black/10 rounded-3xl flex flex-col items-center justify-center text-gray-400 opacity-60">
                      <span className="text-sm">等待生成结果...</span>
                      <span className="text-[10px] tracking-widest mt-1">WAITING FOR OUTPUT</span>
                  </div>
              )}
           </div>
        </div>

      </main>
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 4px; }
        @keyframes progress { 0% { width: 0%; } 100% { width: 100%; } }
        .animate-progress { animation: progress 2s infinite cubic-bezier(0.4, 0, 0.2, 1); }
      `}</style>
    </div>
  );
}