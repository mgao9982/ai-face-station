'use client';
import { useState, useRef } from 'react';

// 结果类型定义
interface ResultItem {
  id: string;
  src: string;
  result: string;
  originalFile: File;
  loading: boolean;
  duration: string;
}

export default function Home() {
  const [bodyFiles, setBodyFiles] = useState<File[]>([]);
  const [faceImg, setFaceImg] = useState<File | null>(null);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [progress, setProgress] = useState('');

  const bodyInputRef = useRef<HTMLInputElement>(null);
  const faceInputRef = useRef<HTMLInputElement>(null);

  // 格式化时间
  const formatDuration = (ms: number) => (ms / 1000).toFixed(2) + 's';

  // 处理上传
  const handleBodyUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setBodyFiles(Array.from(e.target.files));
  };
  const handleFaceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setFaceImg(e.target.files[0]);
  };

  // 批量换脸主逻辑
  const handleSwap = async () => {
    if (bodyFiles.length === 0 || !faceImg) return alert('MISSING ASSETS / 请上传图片');
    
    setIsBatchProcessing(true);
    setResults([]); 
    
    // 平滑滚动
    setTimeout(() => window.scrollTo({ top: 800, behavior: 'smooth' }), 100);

    for (let i = 0; i < bodyFiles.length; i++) {
      const currentBodyFile = bodyFiles[i];
      setProgress(`PROCESSING 0${i + 1} / 0${bodyFiles.length}`);

      const startTime = Date.now();
      const formData = new FormData();
      formData.append('body_images', currentBodyFile);
      formData.append('face_image', faceImg);

      try {
        const res = await fetch('/api/swap', { method: 'POST', body: formData });
        const data = await res.json();
        const endTime = Date.now();

        if (data.error) throw new Error(data.error);

        let newUrl = data.results?.[0] || data.result;
        if (newUrl) {
          setResults(prev => [...prev, { 
            id: Math.random().toString(36).substr(2, 9),
            src: URL.createObjectURL(currentBodyFile), 
            result: newUrl,
            originalFile: currentBodyFile,
            loading: false,
            duration: formatDuration(endTime - startTime)
          }]);
        }
      } catch (e) { console.error(e); }
    }
    setIsBatchProcessing(false);
    setProgress('');
  };

  // 重绘逻辑
  const handleRegenerate = async (index: number) => {
    if (!faceImg) return;
    setResults(prev => prev.map((item, i) => i === index ? { ...item, loading: true } : item));
    const targetItem = results[index];
    const startTime = Date.now();
    
    const formData = new FormData();
    formData.append('body_images', targetItem.originalFile); 
    formData.append('face_image', faceImg);

    try {
      const res = await fetch('/api/swap', { method: 'POST', body: formData });
      const data = await res.json();
      const endTime = Date.now();
      let newUrl = data.results?.[0] || data.result;

      if (newUrl) {
        setResults(prev => prev.map((item, i) => 
          i === index ? { ...item, result: newUrl, loading: false, duration: formatDuration(endTime - startTime) } : item
        ));
      }
    } catch (e: any) {
      alert(e.message);
      setResults(prev => prev.map((item, i) => i === index ? { ...item, loading: false } : item));
    }
  };

  return (
    // 全局背景：使用一张高质量的沙漠/风景图，并叠加模糊层
    <div className="min-h-screen text-white font-sans selection:bg-white selection:text-black relative overflow-x-hidden">
      
      {/* 背景层 */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat transform scale-105"
        style={{ 
          backgroundImage: 'url("https://images.unsplash.com/photo-1614730341194-75c60740a5d3?q=80&w=3000&auto=format&fit=crop")',
        }}
      >
        {/* 叠加一个暗色遮罩，让文字更清晰 */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-xl"></div>
        {/* 增加一些梦幻的光晕 */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-black/20 to-transparent"></div>
      </div>

      <main className="relative z-10 max-w-[1400px] mx-auto px-6 py-12 flex flex-col gap-12">
        
        {/* 顶部导航 */}
        <header className="flex justify-between items-center border-b border-white/10 pb-6">
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold tracking-tighter">O2® <span className="text-xs font-normal opacity-60 ml-2">STUDIO AI</span></div>
          </div>
          <div className="hidden md:flex gap-8 text-xs tracking-widest opacity-60">
            <span>THE LATE 2050</span>
            <span>MOONISH DESIGN</span>
          </div>
          <button className="bg-white text-black px-6 py-2 rounded-full text-xs font-bold hover:bg-white/90 transition">
            PRO VERSION
          </button>
        </header>

        {/* 核心操作区 - 模仿参考图的大卡片布局 */}
        <div className="grid lg:grid-cols-12 gap-6 h-auto lg:h-[600px]">
          
          {/* 左侧：01 身体上传区 (模仿 NIKE 卡片) */}
          <div className="lg:col-span-4 relative group cursor-pointer" onClick={() => bodyInputRef.current?.click()}>
            <div className="absolute inset-0 bg-white/5 backdrop-blur-md rounded-[40px] border border-white/10 transition-all duration-500 group-hover:bg-white/10 group-hover:border-white/20"></div>
            
            {/* 巨大的背景数字 */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[180px] font-thin text-white/5 leading-none select-none pointer-events-none font-sans">01</div>
            
            <div className="relative h-full p-8 flex flex-col justify-between z-10">
              <div>
                <h2 className="text-4xl font-light uppercase tracking-wide">Body<br/>Source</h2>
                <p className="text-xs opacity-50 mt-4 tracking-wider">UPLOAD TARGET IMAGES / MULTI-SELECT</p>
              </div>

              {/* 预览展示 */}
              <div className="flex-1 flex items-center justify-center my-4">
                {bodyFiles.length === 0 ? (
                  <div className="w-32 h-32 rounded-full border border-dashed border-white/20 flex items-center justify-center group-hover:scale-110 transition duration-500">
                    <span className="text-4xl opacity-50 font-thin">+</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 w-full max-h-[250px] overflow-hidden opacity-80">
                    {bodyFiles.slice(0, 4).map((f, i) => (
                      <img key={i} src={URL.createObjectURL(f)} className="w-full h-32 object-cover rounded-xl grayscale group-hover:grayscale-0 transition duration-500" />
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-between items-end">
                <div className="text-xs opacity-40">
                  {bodyFiles.length > 0 ? `${bodyFiles.length} FILES SELECTED` : 'WAITING FOR INPUT'}
                </div>
                <div className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
              </div>
            </div>
            <input ref={bodyInputRef} type="file" multiple className="hidden" onChange={handleBodyUpload} />
          </div>

          {/* 中间：02 脸部上传区 (模仿 Hoodie 卡片) */}
          <div className="lg:col-span-5 relative group cursor-pointer" onClick={() => faceInputRef.current?.click()}>
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-black/20 backdrop-blur-xl rounded-[40px] border border-white/20 transition-all duration-500 group-hover:border-white/40"></div>
            
             {/* 巨大的背景数字 */}
             <div className="absolute top-4 right-8 text-[180px] font-thin text-white/5 leading-none select-none pointer-events-none">02</div>

            <div className="relative h-full p-8 flex flex-col z-10">
              <div className="flex justify-between items-start">
                <div>
                   <h2 className="text-4xl font-light uppercase tracking-wide">Face<br/>Reference</h2>
                   <p className="text-xs opacity-50 mt-4 tracking-wider">UPLOAD SOURCE FACE</p>
                </div>
                {/* 装饰性UI元素 */}
                <div className="flex items-center gap-2">
                   <div className="h-1 w-12 bg-white/20 rounded-full"></div>
                </div>
              </div>

              {/* 脸部预览 (模仿悬浮球效果) */}
              <div className="flex-1 flex items-center justify-center relative my-6">
                {/* 模拟光晕背景 */}
                <div className="absolute w-64 h-64 bg-white/5 rounded-full blur-3xl group-hover:bg-white/10 transition duration-700"></div>
                
                <div className="relative w-56 h-56 rounded-full border border-white/10 flex items-center justify-center overflow-hidden bg-black/20 backdrop-blur-sm group-hover:scale-105 transition duration-500">
                  {faceImg ? (
                    <img src={URL.createObjectURL(faceImg)} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs tracking-widest opacity-40">DRAG & DROP</span>
                  )}
                  
                  {/* 悬浮标签 */}
                  {faceImg && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-md px-4 py-1 rounded-full border border-white/10 text-[10px] tracking-widest uppercase">
                      Target
                    </div>
                  )}
                </div>
              </div>

              <div className="text-center">
                 <div className="inline-block px-4 py-2 rounded-full border border-white/10 bg-white/5 text-xs tracking-widest">
                    {faceImg ? faceImg.name.toUpperCase() : 'NO FILE SELECTED'}
                 </div>
              </div>
            </div>
            <input ref={faceInputRef} type="file" className="hidden" onChange={handleFaceUpload} />
          </div>

          {/* 右侧：控制台 */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            
            {/* 开始按钮卡片 */}
            <div className="flex-1 relative rounded-[40px] overflow-hidden p-1">
              <div className="absolute inset-0 bg-white/5 backdrop-blur-md border border-white/10 rounded-[40px]"></div>
              
              <button 
                onClick={handleSwap}
                disabled={isBatchProcessing}
                className={`relative w-full h-full rounded-[36px] flex flex-col items-center justify-center gap-4 transition-all duration-500 group
                  ${isBatchProcessing ? 'bg-black/40 cursor-not-allowed' : 'bg-white hover:bg-gray-200 text-black'}`}
              >
                 {isBatchProcessing ? (
                   <>
                    <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    <span className="text-xs tracking-widest text-white">PROCESSING...</span>
                   </>
                 ) : (
                   <>
                    <div className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center group-hover:scale-110 transition">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold tracking-tighter">GENERATE</div>
                      <div className="text-[10px] opacity-60 tracking-widest mt-1">BATCH PROCESS ({bodyFiles.length})</div>
                    </div>
                   </>
                 )}
              </button>
            </div>

            {/* 状态信息 */}
            <div className="h-24 relative rounded-[30px] bg-black/40 backdrop-blur-md border border-white/5 flex items-center justify-center px-6">
               <div className="w-full">
                 <div className="flex justify-between text-[10px] opacity-40 mb-2 uppercase tracking-widest">
                   <span>System Status</span>
                   <span>Online</span>
                 </div>
                 {progress ? (
                   <div className="text-xs text-white tracking-wider animate-pulse">{progress}</div>
                 ) : (
                   <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                     <div className="w-full h-full bg-white/20 origin-left scale-x-0 transition-transform"></div>
                   </div>
                 )}
               </div>
            </div>

          </div>
        </div>

        {/* 结果展示区 - 横向瀑布流 */}
        {results.length > 0 && (
          <div className="mt-12 animate-fade-in">
             <div className="flex items-center gap-4 mb-8 opacity-80">
               <div className="w-2 h-8 bg-white"></div>
               <h2 className="text-3xl font-light uppercase tracking-wider">Output <span className="opacity-40">Gallery</span></h2>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {results.map((item, index) => (
                 <div key={item.id} className="group relative aspect-[4/5] rounded-[30px] overflow-hidden bg-black/20 border border-white/10 backdrop-blur-sm">
                    {/* 结果图 */}
                    <img 
                      src={item.result} 
                      className={`w-full h-full object-cover transition duration-700 group-hover:scale-105 ${item.loading ? 'blur-lg opacity-50' : ''}`} 
                    />
                    
                    {/* 悬浮信息层 */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition duration-300 flex flex-col justify-end p-6">
                       <div className="flex justify-between items-end">
                         <div>
                            <div className="text-[10px] tracking-widest opacity-60 uppercase mb-1">Generated in</div>
                            <div className="text-xl font-bold font-mono">{item.duration}</div>
                         </div>
                         <div className="flex gap-2">
                            {/* 重绘按钮 */}
                            <button 
                              onClick={() => handleRegenerate(index)}
                              disabled={item.loading}
                              className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center hover:bg-white hover:text-black transition"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                            </button>
                            {/* 下载按钮 */}
                            <a 
                              href={item.result} 
                              download
                              className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition"
                            >
                               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                            </a>
                         </div>
                       </div>
                    </div>

                    {/* Loading 状态 */}
                    {item.loading && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
                      </div>
                    )}
                 </div>
               ))}
             </div>
          </div>
        )}

      </main>
    </div>
  );
}