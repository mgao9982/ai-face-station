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

export default function Home() {
  const [faceFile, setFaceFile] = useState<File | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isZipping, setIsZipping] = useState(false);
  
  const faceInputRef = useRef<HTMLInputElement>(null);
  const bodyInputRef = useRef<HTMLInputElement>(null);
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

  const handleStop = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    if (intervalRefs.current[id]) {
      clearInterval(intervalRefs.current[id]);
      delete intervalRefs.current[id];
    }
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'cancelled', log: 'STOPPED' } : t));
    if (task.taskId) {
      try { fetch('/api/cancel', { method: 'POST', body: JSON.stringify({ taskId: task.taskId }) }); } catch (e) { console.error(e); }
    }
  };

  const handleRemoveTask = (id: string) => {
    if (intervalRefs.current[id]) {
        clearInterval(intervalRefs.current[id]);
        delete intervalRefs.current[id];
    }
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const handleRemoveFace = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFaceFile(null);
    if (faceInputRef.current) faceInputRef.current.value = '';
  };

  const handleBodyUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newTasks = Array.from(e.target.files).map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        preview: URL.createObjectURL(file),
        status: 'waiting' as const,
        log: 'READY',
      }));
      setTasks(prev => [...prev, ...newTasks]);
    }
  };

  const handleFaceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setFaceFile(e.target.files[0]);
  };

  const pollTask = async (id: string, taskId: string) => {
    if (intervalRefs.current[id]) clearInterval(intervalRefs.current[id]);
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch('/api/async/status', { method: 'POST', body: JSON.stringify({ taskId }) });
        const data = await res.json();
        setTasks(prev => prev.map(task => {
          if (task.id !== id) return task;
          if (task.status === 'cancelled') { clearInterval(intervalId); return task; }
          if (data.status === 'SUCCESS') {
            clearInterval(intervalId);
            delete intervalRefs.current[id];
            const timeTaken = task.startTime ? Date.now() - task.startTime : 0;
            return { ...task, status: 'success', resultUrl: data.output, log: 'DONE', duration: formatDuration(timeTaken) };
          } else if (data.status === 'FAILED') {
            clearInterval(intervalId);
            delete intervalRefs.current[id];
            return { ...task, status: 'failed', log: `ERR: ${data.msg || 'Fail'}` };
          }
          return { ...task, status: 'running', log: 'PROCESSING' };
        }));
      } catch (e) { console.error(e); }
    }, 3000);
    intervalRefs.current[id] = intervalId;
  };

  const handleStart = async () => {
    if (tasks.length === 0 || !faceFile) return alert('请上传图片 / Upload Images First');
    // 移动端滚动逻辑优化
    const gallery = document.getElementById('output-gallery');
    if(gallery) gallery.scrollIntoView({ behavior: 'smooth' });
    
    const now = Date.now();
    setTasks(prev => prev.map(t => t.status === 'waiting' ? { ...t, status: 'uploading', log: 'PREPARING...', startTime: now } : t));

    let faceUrl = '';
    try { faceUrl = await uploadToBlob(faceFile); } catch (e) { return alert('Face Upload Failed'); }

    tasks.forEach(async (task) => {
      if (task.status !== 'waiting' && task.log !== 'PREPARING...') return;
      try {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, log: 'UPLOADING...' } : t));
        const bodyUrl = await uploadToBlob(task.file);
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'submitting', log: 'INITIATING...' } : t));
        const data = await triggerTask(bodyUrl, faceUrl);
        if (data.taskId) {
          setTasks(prev => prev.map(t => t.id === task.id ? { ...t, taskId: data.taskId, status: 'running', log: 'QUEUED' } : t));
          pollTask(task.id, data.taskId);
        } else { throw new Error('NO ID'); }
      } catch (e: any) {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'failed', log: 'FAIL' } : t));
      }
    });
  };

  const handleRegenerate = async (id: string) => {
    if (!faceFile) return alert('脸部图丢失');
    if (intervalRefs.current[id]) clearInterval(intervalRefs.current[id]);
    const now = Date.now();
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'uploading', log: 'RETRYING...', resultUrl: undefined, startTime: now } : t));
    const targetTask = tasks.find(t => t.id === id);
    if (!targetTask) return;
    try {
      const bodyUrl = await uploadToBlob(targetTask.file);
      const faceUrl = await uploadToBlob(faceFile);
      const data = await triggerTask(bodyUrl, faceUrl);
      if (data.taskId) {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, taskId: data.taskId, status: 'running', log: 'QUEUED' } : t));
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
      
      {/* 顶部标记 */}
      <div className="fixed top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 z-50"></div>
      <div className="fixed top-4 right-4 z-50">
          <span className="bg-black text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-widest shadow-lg">PRO / MOBILE</span>
      </div>

      <div className="fixed inset-0 pointer-events-none z-0 opacity-20">
         <svg width="100%" height="100%"><path d="M0,100 Q400,200 800,0" fill="none" stroke="black" strokeWidth="1" /></svg>
      </div>

      <main className="relative z-10 max-w-[1600px] mx-auto px-6 py-12 flex flex-col lg:flex-row items-center justify-center min-h-screen gap-8 lg:gap-24">
        
        {/* 1. 中间胶囊 (在手机端，为了操作方便，把脸部上传放到最前面) */}
        <div className="w-full lg:w-1/3 flex flex-col items-center order-1 lg:order-2 relative">
          <div className="relative w-full max-w-[340px] h-[500px] lg:h-[560px] rounded-[40px] lg:rounded-[170px] bg-white/10 backdrop-blur-2xl border border-white/40 shadow-2xl shadow-black/10 flex flex-col items-center justify-between p-6 overflow-hidden transition duration-700">
            <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/40 to-transparent pointer-events-none"></div>

            <div onClick={() => faceInputRef.current?.click()} className="relative mt-4 w-[240px] h-[240px] lg:w-[280px] lg:h-[280px] rounded-full bg-black/5 border border-white/30 overflow-hidden cursor-pointer transition duration-700 active:scale-95 hover:scale-105 shadow-inner">
              {faceFile ? (
                <>
                    <img src={URL.createObjectURL(faceFile)} className="w-full h-full object-cover" />
                    {/* 手机端常驻删除按钮 */}
                    <button 
                        onClick={handleRemoveFace}
                        className="absolute top-4 right-4 w-10 h-10 bg-black/60 text-white rounded-full flex items-center justify-center z-50 backdrop-blur-md border border-white/20"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-black/20">
                    <span className="text-5xl font-thin mb-2">+</span>
                    <span className="text-xs font-bold tracking-widest">上传脸部</span>
                </div>
              )}
              <input ref={faceInputRef} type="file" className="hidden" onChange={handleFaceUpload} />
            </div>

            <div className="text-center z-10 w-full px-4">
              <h1 className="text-3xl font-light tracking-tighter text-black mix-blend-overlay mt-2">脸部参考</h1>
              
              <div className="mt-4 w-full min-h-[30px]">
                {isGlobalRunning ? (
                  <div className="space-y-2 animate-fade-in">
                    <div className="flex justify-between text-[9px] font-bold tracking-widest opacity-60 px-2">
                      <span>PROCESSING</span>
                      <span>{completedTasks} / {totalTasks}</span>
                    </div>
                    <div className="h-1 w-full bg-black/5 rounded-full overflow-hidden">
                      <div className="h-full bg-black transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }}></div>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] opacity-40 tracking-wider">请上传目标人脸</div>
                )}
              </div>
            </div>

            <button onClick={handleStart} disabled={isGlobalRunning} className={`mb-4 text-white w-full max-w-[220px] h-14 rounded-full flex items-center justify-center gap-2 shadow-xl transition duration-300 z-20 ${isGlobalRunning ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#1A1A1A] active:scale-95'}`}>
              <span className="text-xs font-bold tracking-widest">{isGlobalRunning ? 'BUSY' : 'GENERATE'}</span>
            </button>
          </div>
        </div>

        {/* 2. 左侧：身体图列表 (手机端排在第二) */}
        <div className="w-full lg:w-1/4 flex flex-col gap-4 order-2 lg:order-1 h-auto lg:h-[600px]">
          <div className="flex justify-between items-end border-b border-black/10 pb-4 mb-2">
            <div>
                <h2 className="text-3xl lg:text-4xl font-light tracking-tighter leading-none">BODY</h2>
                <p className="text-xs font-bold text-gray-400 tracking-widest mt-1">身体素材源</p>
            </div>
            <div className="text-[10px] font-bold tracking-widest opacity-40 text-right">
              支持多选<br/>MULTI-SELECT
            </div>
          </div>

          <div onClick={() => bodyInputRef.current?.click()} className="h-24 w-full rounded-2xl bg-white/30 backdrop-blur-md border border-white/50 flex items-center justify-between px-8 cursor-pointer active:bg-white/80 transition duration-300 shadow-lg shadow-black/5">
            <div className="flex flex-col gap-1">
                <span className="text-sm font-bold tracking-widest opacity-80">添加图片</span>
                <span className="text-[10px] opacity-40">ADD IMAGES</span>
            </div>
            <div className="w-10 h-10 rounded-full border border-black/10 flex items-center justify-center text-xl font-thin">+</div>
            <input ref={bodyInputRef} type="file" multiple className="hidden" onChange={handleBodyUpload} />
          </div>

          <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1 max-h-[400px] lg:max-h-none">
            {tasks.map((task, index) => (
              <div key={task.id} className="relative flex items-center gap-4 p-3 rounded-xl bg-white/40 backdrop-blur-sm border border-white/40 overflow-hidden">
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
                
                {/* 🔴 移动端适配：常驻显示删除/停止按钮，不再依赖 hover */}
                <div className="flex items-center z-20">
                    {(task.status === 'running' || task.status === 'submitting' || task.status === 'uploading') ? (
                        <button 
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleStop(index); }}
                            className="w-8 h-8 bg-red-100 text-red-500 rounded-full flex items-center justify-center shadow-sm active:scale-95"
                        >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>
                        </button>
                    ) : (
                        <button 
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemoveTask(task.id); }}
                            className="w-8 h-8 bg-white/60 text-gray-400 rounded-full flex items-center justify-center shadow-sm active:scale-95"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3. 右侧：结果画廊 (手机端排在最后) */}
        <div id="output-gallery" className="w-full lg:w-1/3 order-3 h-auto lg:h-[600px] relative pb-20 lg:pb-0">
           <div className="absolute -top-10 right-0 text-[100px] lg:text-[120px] font-thin text-black/5 leading-none pointer-events-none">02</div>
           
           <div className="flex justify-between items-start mb-6 border-l-2 border-black pl-4">
              <div>
                  <h2 className="text-2xl font-light tracking-tight">OUTPUT</h2>
                  <h3 className="text-sm font-bold text-gray-400 tracking-widest">结果画廊</h3>
              </div>
              {successTasks.length > 0 && (
                <button 
                  onClick={handleDownloadAll} 
                  disabled={isZipping}
                  className="bg-white border border-gray-300 px-4 py-2 rounded-full text-[10px] font-bold tracking-widest active:bg-black active:text-white transition flex items-center gap-2 shadow-sm"
                >
                   {isZipping ? '...' : 'ALL'} <span className="hidden sm:inline">DOWNLOAD</span>
                </button>
              )}
           </div>
           
           <div className="grid grid-cols-2 gap-4 h-auto lg:h-full lg:overflow-y-auto lg:pb-20 content-start custom-scrollbar">
              {tasks.filter(t => t.resultUrl).map((task, index) => (
                <div key={task.id} className="relative aspect-[3/4] bg-white p-2 rounded-2xl shadow-md">
                   <div className="w-full h-full rounded-xl overflow-hidden relative bg-black/5">
                      <img src={task.resultUrl} className="w-full h-full object-cover" />
                      
                      {/* 📱 移动端适配：操作栏改为底部常驻半透明条，不再依赖 hover */}
                      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent flex justify-between items-end">
                         {task.duration && <div className="text-white/80 text-[9px] font-mono mb-1">{task.duration}</div>}
                         <div className="flex gap-2">
                            <button onClick={() => handleRegenerate(tasks.indexOf(task))} className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center active:bg-white active:text-black transition border border-white/20">↺</button>
                            <a href={task.resultUrl} target="_blank" download className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center active:bg-white active:text-black transition border border-white/20">↓</a>
                         </div>
                      </div>

                   </div>
                </div>
              ))}
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