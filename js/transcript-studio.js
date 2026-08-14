/* ScriptFlow Pro - Conversation Notes / Transcript Studio
 * FastAPI + Whisper speech-to-text + deterministic booking extraction.
 * Existing CRM/calendar data is untouched. No LLM or cloud booking-analysis
 * service is used. Booking fields are extracted conservatively
 * from transcript-supported evidence and missing values remain Not specified.
 */
(function () {
  'use strict';

  // Workspace Whisper provider. The transcription engine is open-source
  // and self-hostable: no Gemini, Puter, LLM, or per-minute API is required.
  // For production, set window.SCRIPTFLOW_TRANSCRIPTION_API_URL to your FastAPI
  // service URL. If omitted, the app uses the same-origin /transcribe endpoint.
  // Production FastAPI endpoint. Keep the override so local/self-hosted deployments
  // can point the studio at another service without changing this file.
  const DEFAULT_TRANSCRIPTION_API_URL = 'https://app-scriptflow-prov2.onrender.com';
  const TRANSCRIPTION_API_URL = String(
    window.SCRIPTFLOW_TRANSCRIPTION_API_URL || DEFAULT_TRANSCRIPTION_API_URL
  ).replace(/\/+$/, '');
  const WORKSPACE_MODELS = {
    fast: 'tiny',
    balanced: 'base',
    accurate: 'small'
  };
  const LANGUAGES = [
    ['auto','Auto-detect'],['en','English'],['es','Spanish'],['fr','French'],['de','German'],['it','Italian'],
    ['pt','Portuguese'],['nl','Dutch'],['pl','Polish'],['tr','Turkish'],['ru','Russian'],['uk','Ukrainian'],
    ['ar','Arabic'],['hi','Hindi'],['id','Indonesian'],['ja','Japanese'],['ko','Korean'],['zh','Chinese'],
    ['vi','Vietnamese'],['th','Thai'],['tl','Filipino'],['sv','Swedish'],['da','Danish'],['no','Norwegian'],
    ['fi','Finnish'],['cs','Czech'],['ro','Romanian'],['hu','Hungarian'],['el','Greek'],['he','Hebrew']
  ];


  const Studio = {
    state: {
      phase: 'upload', file: null, audioUrl: '', fileName: '', transcript: '', chunks: [],
      language: 'auto', translate: false, subtitles: true, speakerId: false,
      summaryMode: 'off', model: 'fast', provider: 'workspace-whisper', fastApiModel: WORKSPACE_MODELS.fast,
      busy: false, cancelRequested: false, audioDuration: 0, sourceType: '', lastSummary: '', selectedChunkIndex: 0,
      initialized: false, uploadInputBound: false, historyLoaded: false, history: [], historyOpen: false, historyCloudDisabled: false, historyCloudChecked: false
    },

    init() {
      if (this.state.initialized) return;
      this.state.initialized = true;
      document.addEventListener('click', (e) => {
        const item = e.target.closest('[data-tool="transcript"]');
        if (item && typeof FeaturePanel !== 'undefined') FeaturePanel.show('transcript', '🎙️ Conversation Notes');
      });
    },

    render(container) {
      if (!container) return;
      this.revokeUrl();
      this.state.phase = 'upload';
      this.state.file = null;
      this.state.fileName = '';
      this.state.transcript = '';
      this.state.chunks = [];
      this.state.sourceType = '';
      this.state.aiBooking = null;
      this.state.historyId = null;
      this.state.historyCreatedAt = null;
      container.innerHTML = this.uploadView();
      this.bindUpload(container);
    },

    uploadView() {
      return `
      <div class="ts-pro">
        <div class="ts-upload-shell">
          <div class="ts-brand-mark"><i class="fas fa-waveform-lines"></i></div>
          <div class="ts-pro-title">OPUS to Text <span>Local audio transcription</span></div>
          <p class="ts-pro-subtitle">Convert OPUS and other supported recordings into clean, searchable text. Processing uses the project's local speech-recognition service—no Gemini, Puter, or generative AI is used.</p>

          <div class="ts-source-tabs" role="tablist">
            <button class="ts-source-tab active" data-source-tab="file"><i class="far fa-file-audio"></i> File upload</button>
            <button class="ts-source-tab" data-source-tab="link"><i class="fas fa-link"></i> Paste link</button>
          </div>

          <div class="ts-source-panel active" data-source-panel="file">
            <input id="tsFileInput" type="file" hidden accept=".opus,.ogg,.oga,.webm,.mp3,.wav,.m4a,.mp4,.aac,.flac,.txt,.srt,.vtt,.csv,audio/*,video/*" />
            <div class="ts-dropzone" id="tsDropzone" tabindex="0" role="button" aria-label="Upload audio or transcript">
              <div class="ts-drop-icons"><span><i class="fas fa-microphone"></i></span><strong><i class="fas fa-waveform-lines"></i></strong><span><i class="fas fa-video"></i></span></div>
              <h3>Click or drag &amp; drop to upload your file</h3>
              <p>OPUS, OGG, WAV, MP3, M4A, MP4, WebM, FLAC, TXT, SRT, VTT and CSV</p>
              <button class="ts-primary-btn" id="tsChooseFile"><i class="fas fa-upload"></i> Upload a file</button>
              <small>Your recording is sent only to your configured ScriptFlow Pro transcription server and processed by its local speech-recognition engine.</small>
            </div>
          </div>

          <div class="ts-source-panel" data-source-panel="link">
            <div class="ts-link-box">
              <i class="fas fa-link"></i>
              <input id="tsUrlInput" type="url" placeholder="Paste a direct audio/video URL" autocomplete="off" />
              <button class="ts-primary-btn" id="tsLoadUrl"><i class="fas fa-arrow-right"></i> Load</button>
            </div>
            <p class="ts-link-help">The remote server must allow browser access (CORS). For private files, upload the file directly instead.</p>
          </div>

          <div class="ts-capability-row">
            <span><i class="fas fa-language"></i> Multiple languages</span>
            <span><i class="fas fa-microchip"></i> Local speech recognition</span>
            <span><i class="fas fa-file-export"></i> SRT / VTT / TXT / CSV</span>
          </div>
          <div class="ts-error" id="tsUploadError" hidden></div>
        </div>
      </div>`;
    },

    bindUpload(container) {
      const input = container.querySelector('#tsFileInput');
      const zone = container.querySelector('#tsDropzone');
      const choose = container.querySelector('#tsChooseFile');
      choose.onclick = (e) => { e.stopPropagation(); input.click(); };
      zone.onclick = (e) => { if (e.target.closest('button')) return; input.click(); };
      zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') input.click(); });
      input.onchange = () => this.handleSource(input.files[0], container);
      ['dragenter','dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('dragover'); }));
      ['dragleave','drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('dragover'); }));
      zone.addEventListener('drop', e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) this.handleSource(f, container); });

      container.querySelectorAll('[data-source-tab]').forEach(tab => tab.onclick = () => {
        container.querySelectorAll('[data-source-tab]').forEach(x => x.classList.toggle('active', x === tab));
        container.querySelectorAll('[data-source-panel]').forEach(p => p.classList.toggle('active', p.dataset.sourcePanel === tab.dataset.sourceTab));
      });
      container.querySelector('#tsLoadUrl').onclick = () => this.loadUrl(container);
      container.querySelector('#tsUrlInput').addEventListener('keydown', e => { if (e.key === 'Enter') this.loadUrl(container); });
    },

    async loadUrl(container) {
      const url = container.querySelector('#tsUrlInput').value.trim();
      if (!/^https?:\/\//i.test(url)) return this.uploadError(container, 'Enter a valid http(s) audio or video URL.');
      this.uploadError(container, '');
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const blob = await res.blob();
        const ext = this.extFromUrl(url) || this.extFromMime(blob.type);
        const file = new File([blob], `remote-audio${ext || '.audio'}`, { type: blob.type || 'application/octet-stream' });
        this.handleSource(file, container);
      } catch (err) {
        this.uploadError(container, 'This link cannot be loaded in the browser. The server may block CORS. Download the file and upload it directly instead.');
      }
    },

    handleSource(file, container) {
      if (!file) return;
      const name = file.name || 'audio';
      const isText = /\.(txt|srt|vtt|csv)$/i.test(name) || /^text\//i.test(file.type);
      const isAudio = file.type.startsWith('audio/') || /\.(opus|ogg|oga|webm|mp3|wav|m4a|aac|flac)$/i.test(name);
      const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(name);
      if (!isText && !isAudio && !isVideo) return this.uploadError(container, 'Unsupported file type. Please upload an audio/video file or a transcript file.');
      this.state.file = file;
      this.state.fileName = name;
      this.state.sourceType = isText ? 'text' : 'audio';
      if (isText) {
        const reader = new FileReader();
        reader.onload = () => {
          this.state.transcript = this.cleanTranscript(String(reader.result || ''));
          this.state.chunks = this.state.transcript ? [{ start: 0, end: 0, text: this.state.transcript }] : [];
          this.state.phase = 'result';
          this.saveTranscriptHistory();
          this.renderCurrent(container);
        };
        reader.readAsText(file);
      } else {
        this.state.audioUrl = URL.createObjectURL(file);
        this.state.phase = 'configure';
        this.renderCurrent(container);
      }
    },

    renderCurrent(container) {
      if (this.state.phase === 'configure') {
        container.innerHTML = this.configureView();
        this.bindConfigure(container);
      } else if (this.state.phase === 'result') {
        container.innerHTML = this.resultView();
        this.bindResult(container);
      }
    },

    configureView() {
      const f = this.state.file;
      return `
      <div class="ts-pro ts-config-page">
        <div class="ts-config-card">
          <div class="ts-source-tabs"><button class="ts-source-tab active"><i class="far fa-file-audio"></i> File upload</button><button class="ts-source-tab" disabled><i class="fas fa-link"></i> Paste link</button></div>
          <div class="ts-file-card">
            <div class="ts-file-icon"><i class="fas fa-file-audio"></i></div>
            <div class="ts-file-info"><strong>${this.esc(this.state.fileName)}</strong><span><i class="far fa-clock"></i> Calculating duration</span><small>${this.formatBytes(f ? f.size : 0)}</small></div>
            <button class="ts-icon-btn" id="tsRemoveFile" aria-label="Remove file"><i class="fas fa-trash"></i></button>
          </div>
          <div class="ts-rule"></div>
          <div class="ts-option-row"><div><b><i class="fas fa-microphone-lines"></i> Audio language</b><small>Choose the language spoken in your audio. Auto-detect is recommended when unsure.</small></div><select id="tsLanguage">${LANGUAGES.map(([v,l]) => `<option value="${v}" ${this.state.language===v?'selected':''}>${l}</option>`).join('')}</select></div>
          <div class="ts-option-row"><div><b><i class="fas fa-language"></i> Translation</b><small>Translate the transcript to English after transcription.</small></div><label class="ts-switch"><input id="tsTranslate" type="checkbox" ${this.state.translate?'checked':''}><span></span></label></div>
          <div class="ts-option-row"><div><b><i class="fas fa-closed-captioning"></i> Generate subtitles</b><small>Create timestamped SRT and VTT files from detected speech segments.</small></div><label class="ts-switch"><input id="tsSubtitles" type="checkbox" ${this.state.subtitles?'checked':''}><span></span></label></div>
          <div class="ts-option-row"><div><b><i class="fas fa-users"></i> Speaker labels</b><small>Add editable Speaker 1 / Speaker 2 labels to transcript segments after transcription. Workspace Whisper does not perform automatic speaker identification.</small></div><label class="ts-switch"><input id="tsSpeaker" type="checkbox" ${this.state.speakerId?'checked':''}><span></span></label></div>
          <div class="ts-option-row"><div><b><i class="fas fa-list-check"></i> Auto summary</b><small>Generate a concise or detailed rule-based summary from the completed transcript.</small></div><select id="tsSummaryMode"><option value="off">Off</option><option value="concise" ${this.state.summaryMode==='concise'?'selected':''}>Concise</option><option value="detailed" ${this.state.summaryMode==='detailed'?'selected':''}>Detailed</option></select></div>
          <div class="ts-option-row"><div><b><i class="fas fa-microchip"></i> Transcription model</b><small>Runs on your workspace service with open-source Whisper. Choose speed or accuracy; no commercial transcription API credits are required.</small></div><select id="tsModel"><option value="fast" ${this.state.model==='fast'?'selected':''}>Fast · Whisper Tiny</option><option value="balanced" ${this.state.model==='balanced'?'selected':''}>Balanced · Whisper Base</option><option value="accurate" ${this.state.model==='accurate'?'selected':''}>Higher accuracy · Whisper Small</option></select></div>
          <div class="ts-engine-note"><i class="fas fa-shield-halved"></i><div><strong>Runs on your workspace service</strong><span>Whisper handles speech-to-text on your configured server. Booking extraction uses deterministic rules only—no LLM, Gemini, Puter, or AI booking-analysis service.</span></div></div>
          <button class="ts-transcribe-btn" id="tsTranscribe"><span class="ts-btn-content"><i class="fas fa-wand-magic-sparkles"></i> Create Notes</span><span class="ts-btn-progress" aria-hidden="true"><span class="ts-progress-fill"></span></span><span class="ts-btn-percent">0%</span></button>
          <div class="ts-transcribe-status" id="tsTranscribeStatus">Ready when you are.</div>
          <div class="ts-error" id="tsConfigError" hidden></div>
        </div>
      </div>`;
    },

    bindConfigure(container) {
      const audio = new Audio(); audio.preload = 'metadata'; audio.src = this.state.audioUrl;
      audio.onloadedmetadata = () => {
        this.state.audioDuration = audio.duration || 0;
        const meta = container.querySelector('.ts-file-info span');
        if (meta) meta.innerHTML = `<i class="far fa-clock"></i> ${this.formatDuration(audio.duration)}`;
      };
      container.querySelector('#tsRemoveFile').onclick = () => {
        this.revokeUrl(); this.state.file = null; this.state.phase = 'upload'; this.renderCurrent(container);
      };
      container.querySelector('#tsLanguage').onchange = e => { this.state.language = e.target.value; };
      container.querySelector('#tsTranslate').onchange = e => { this.state.translate = e.target.checked; };
      container.querySelector('#tsSubtitles').onchange = e => { this.state.subtitles = e.target.checked; };
      container.querySelector('#tsSpeaker').onchange = e => { this.state.speakerId = e.target.checked; };
      container.querySelector('#tsSummaryMode').onchange = e => { this.state.summaryMode = e.target.value; };
      container.querySelector('#tsModel').onchange = e => { this.state.model = e.target.value; };
      container.querySelector('#tsTranscribe').onclick = () => this.transcribe(container);
    },

    async transcribe(container) {
      if (this.state.busy || !this.state.file) return;
      this.state.busy = true;
      const btn = container.querySelector('#tsTranscribe');
      const status = container.querySelector('#tsTranscribeStatus');
      const content = btn && btn.querySelector('.ts-btn-content');
      const percent = btn && btn.querySelector('.ts-btn-percent');
      const fill = btn && btn.querySelector('.ts-progress-fill');
      const errorBox = container.querySelector('#tsConfigError');
      if (errorBox) { errorBox.hidden = true; errorBox.textContent = ''; }
      if (!btn || !content || !percent || !fill) { this.state.busy = false; return; }
      btn.disabled = true; btn.classList.add('loading');
      content.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading recording…';
      const setProgress = (value, text) => { const n=Math.max(0,Math.min(100,Math.round(value))); fill.style.width=`${n}%`; percent.textContent=`${n}%`; if(status)status.textContent=text||'Processing…'; };
      try {
        setProgress(2,'Connecting to the workspace service…');
        await this.checkTranscriptionApi();
        setProgress(8,'Uploading recording…');
        const form=new FormData();
        form.append('file',this.state.file,this.state.file.name||'audio');
        form.append('format','json'); form.append('keep_wav','false');
        form.append('model',WORKSPACE_MODELS[this.state.model]||WORKSPACE_MODELS.fast);
        form.append('translate',this.state.translate?'true':'false');
        if(this.state.language!=='auto')form.append('language',this.state.language);
        form.append('word_timestamps','false');
        form.append('include_timestamps','true');
        const result=await this.uploadTranscription(form,(loaded,total)=>{const p=total?(loaded/total)*100:0;setProgress(8+p*0.42,`Uploading recording… ${Math.round(p)}%`);},message=>{setProgress(50,message||'Creating notes…');content.innerHTML='<i class="fas fa-microphone-lines fa-beat-fade"></i> Transcribing…';});
        setProgress(94,'Preparing your notes…');
        this.applyFastApiResult(result);
        if(!this.state.transcript)throw new Error('The transcription service returned no speech text.');
        setProgress(99,'Finalizing and saving…');
        await this.saveTranscriptHistory();
        this.state.phase='result'; setProgress(100,'Notes ready.');
        setTimeout(()=>this.renderCurrent(container),250);
      }catch(err){
        console.error('Transcript Studio workspace processing error:',err);
        const message=this.friendlyTranscriptionError(err);
        if(errorBox){errorBox.hidden=false;errorBox.textContent=message;}
        content.innerHTML='<i class="fas fa-wand-magic-sparkles"></i> Create Notes'; btn.disabled=false;btn.classList.remove('loading');setProgress(0,'Ready to retry.');
      }finally{this.state.cancelRequested=false;this.state.busy=false;}
    },

    transcriptionApiUrl(){ return `${TRANSCRIPTION_API_URL}/transcribe`; },
    transcriptionHealthUrl(){ return `${TRANSCRIPTION_API_URL}/health`; },
    async checkTranscriptionApi(){
      const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),8000);
      try{const response=await fetch(this.transcriptionHealthUrl(),{method:'GET',headers:{Accept:'application/json'},signal:controller.signal,cache:'no-store'});if(!response.ok)throw new Error(`Transcription service returned HTTP ${response.status}.`);const data=await response.json().catch(()=>({}));if(data.status&&data.status!=='ok')throw new Error('The transcription service is not ready.');return data;}finally{clearTimeout(timeout);}
    },
    uploadTranscription(formData,onUploadProgress,onProcessing){
      return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST',this.transcriptionApiUrl(),true);xhr.responseType='json';xhr.setRequestHeader('Accept','application/json');xhr.timeout=30*60*1000;
        xhr.upload.onprogress=e=>{if(e.lengthComputable)onUploadProgress?.(e.loaded,e.total);};
        xhr.upload.onloadend=()=>onProcessing?.('Your recording is being processed…');
        xhr.onload=()=>{let payload=xhr.response;if(!payload&&xhr.responseText){try{payload=JSON.parse(xhr.responseText);}catch(_){payload={detail:xhr.responseText};}}if(xhr.status>=200&&xhr.status<300)return resolve(payload||{});reject(new Error(String(payload?.detail||payload?.message||`HTTP ${xhr.status}`)));};
        xhr.onerror=()=>reject(new Error('Network error while contacting the workspace processing service.'));xhr.ontimeout=()=>reject(new Error('The transcription service timed out. Try the Fast model or a shorter recording.'));xhr.onabort=()=>reject(new Error('Transcription was cancelled.'));xhr.send(formData);});
    },
    applyFastApiResult(result){
      const segments=Array.isArray(result?.segments)?result.segments:[]; const text=this.cleanTranscript(String(result?.text||'').trim());
      if(segments.length){this.state.chunks=segments.map(segment=>({start:Number(segment.start)||0,end:Math.max(Number(segment.end)||0,Number(segment.start)||0),text:this.cleanTranscript(String(segment.text||'').trim())})).filter(segment=>segment.text);this.state.transcript=this.state.chunks.map(segment=>segment.text).join(' ').replace(/\s+/g,' ').trim();}
      else{this.state.transcript=text;this.state.chunks=this.chunksFromText(text,Number(result?.duration)||this.state.audioDuration||0);}
      if(Number.isFinite(Number(result?.duration)))this.state.audioDuration=Number(result.duration);this.state.sourceType='audio';
    },
    friendlyTranscriptionError(error){
      const message=String(error?.message||error||'Transcription failed.');
      if(/404|failed to fetch|network|connection|cors/i.test(message))return 'The Workspace service could not be reached. Check that the API is running and that its URL is configured correctly.';
      if(/413|too large|request entity/i.test(message))return 'This recording is larger than the server upload limit. Increase MAX_UPLOAD_MB or use a shorter recording.';
      if(/503|model|loading|not ready/i.test(message))return 'The processing model is still loading or unavailable. Wait a moment and retry.';
      if(/timeout|timed out/i.test(message))return 'The recording took too long to process. Try the Fast option or a shorter recording.';
      if(/decode|codec|format|opus|ogg/i.test(message))return 'The workspace server could not decode this recording. Try OGG/Opus, WAV, MP3, or M4A.';
      return `Workspace processing failed: ${message}`;
    },

    chunksFromText(text, duration) {
      const sentences = this.sentences(text);
      if (!sentences.length) return [{ start: 0, end: Number(duration) || 0, text }];
      const total = Number(duration) || 0;
      const count = sentences.length;
      return sentences.map((sentence, index) => ({
        start: total ? (total * index / count) : 0,
        end: total ? (total * (index + 1) / count) : 0,
        text: sentence
      }));
    },




    // ------------------------------------------------------------
    // Booking Appointment extraction
    // ------------------------------------------------------------
    extractBookingData(text) {
      // Conservative transcript-to-booking extraction: use only transcript-supported facts.
      // Missing values are explicitly marked "Not specified" rather than inferred.
      const sourceRaw = String(text || '').replace(/\r/g, '').trim();
      const source = sourceRaw.replace(/\s+/g, ' ').trim();
      const NOT_SPECIFIED = 'Not specified';

      const cleanValue = (value) => String(value || '')
        .replace(/^\s*[-•*]\s*/, '')
        .replace(/[|;]+$/, '')
        .replace(/\s+/g, ' ')
        .trim();

      const firstMatch = (patterns) => {
        for (const pattern of patterns) {
          const match = sourceRaw.match(pattern) || source.match(pattern);
          if (match && match[1] && cleanValue(match[1])) return cleanValue(match[1]);
        }
        return '';
      };

      const emailRaw = firstMatch([
        /(?:business\s+)?e-?mail(?:\s+address)?\s*[:=-]\s*([^\s,;|]+)/i,
        /(?:mailto:)?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i
      ]);
      const email = emailRaw.replace(/^mailto:/i, '').replace(/[)\]>,.]+$/, '').toLowerCase();

      const phone = firstMatch([
        /(?:phone(?:\s+number)?|mobile|cell|telephone|contact\s+number)\s*[:=-]\s*([+\d][\d\s().-]{6,})/i,
        /(\+?\d[\d\s().-]{7,}\d)/
      ]);

      const business = firstMatch([
        /(?:^|\n)\s*(?:business\s+name|company\s+name|organization\s+name|business|company|organization|firm)\s*[:=-]\s*([^\n,|;]+)/im
      ]);
      const name = firstMatch([
        /(?:^|\n)\s*(?:full\s+name|contact\s+name|customer\s+name|prospect\s+name|client\s+name|name)\s*[:=-]\s*([^\n,|;]+)/im
      ]);
      const role = firstMatch([
        /(?:^|\n)\s*(?:role|title|position|job\s+title|designation)\s*[:=-]\s*([^\n,|;]+)/im
      ]);

      const schedule = this.extractSchedule(sourceRaw);
      const interest = this.detectInterest(sourceRaw);
      const notes = this.buildMeetingNotes(sourceRaw, { business, name, role, schedule, interest });

      return {
        business: business || NOT_SPECIFIED,
        name: name || NOT_SPECIFIED,
        role: role || NOT_SPECIFIED,
        phone: phone || NOT_SPECIFIED,
        dateTime: schedule.display || NOT_SPECIFIED,
        email: email || NOT_SPECIFIED,
        notes,
        interest
      };
    },

    extractSchedule(text) {
      const schedulePatterns = [
        /(?:demo|meeting|appointment|scheduled|callback)?\s*(?:time\s*&\s*date|date\s*&\s*time|datetime)\s*[:=-]\s*((?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?\s+at\s+\d{1,2}(?::\d{2})?\s*(?:AM|PM)(?:\s+(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|GMT|UTC|ET|CT|MT|PT))?)/i,
        /((?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?\s+at\s+\d{1,2}(?::\d{2})?\s*(?:AM|PM)(?:\s+(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|GMT|UTC|ET|CT|MT|PT))?)/i,
        /((?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:AM|PM)(?:\s+(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|GMT|UTC|ET|CT|MT|PT))?)/i
      ];
      let raw = '';
      for (const pattern of schedulePatterns) {
        const m = text.match(pattern);
        if (m) { raw = (m[1] || m[0]).trim(); break; }
      }
      if (!raw) {
        const timeOnly = text.match(/(?:demo|meeting|appointment|callback)?\s*(?:at|time)\s*[:=-]?\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)(?:\s+(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|GMT|UTC|ET|CT|MT|PT))?)/i);
        if (timeOnly) raw = timeOnly[1].trim();
      }
      if (!raw) return { raw: '', display: '', date: '', time: '', timezone: '' };

      const timezoneMatch = raw.match(/\b(EST|EDT|CST|CDT|MST|MDT|PST|PDT|GMT|UTC|ET|CT|MT|PT)\b/i);
      const timezone = timezoneMatch ? timezoneMatch[1].toUpperCase() : '';
      const timeMatch = raw.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i);
      const time = timeMatch ? this.normalizeTimeText(timeMatch[1]) : '';
      const datePart = raw.replace(/\s+at\s+.*$/i, '').trim();
      const normalizedDate = this.parseFlexibleDate(datePart);
      let display = raw.replace(/\s+/g, ' ').trim();
      if (normalizedDate && time) {
        const d = new Date(normalizedDate + 'T00:00:00');
        const weekdayText = d.toLocaleDateString('en-US', { weekday: 'long' });
        const monthText = d.toLocaleDateString('en-US', { month: 'long' });
        const day = d.getDate();
        const yearMentioned = /\b\d{4}\b/.test(datePart);
        display = `${weekdayText}, ${monthText} ${day}${this.ordinal(day)}${yearMentioned ? `, ${d.getFullYear()}` : ''} at ${time}${timezone ? ` ${timezone}` : ''}`;
      } else if (time) {
        display = timezone ? `${time} ${timezone}` : time;
      }
      return { raw, display, date: normalizedDate, time, timezone };
    },

    parseFlexibleDate(value) {
      let s = String(value || '').trim().replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*/i, '').replace(/(\d{1,2})(st|nd|rd|th)\b/gi, '$1');
      const now = new Date();
      const year = (s.match(/\b(\d{4})\b/) || [])[1] || now.getFullYear();
      let m = s.match(/^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:,?\s+\d{4})?$/i);
      if (m) {
        const months = {january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11,jan:0,feb:1,mar:2,apr:3,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11};
        const mi = months[m[1].toLowerCase()];
        const d = new Date(Number(year), mi, Number(m[2]));
        if (d.getFullYear() === Number(year) && d.getMonth() === mi && d.getDate() === Number(m[2])) return `${d.getFullYear()}-${String(mi+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      }
      m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m) return this.validDateParts(Number(m[1]), Number(m[2])-1, Number(m[3]));
      m = s.match(/^(\d{1,2})[\/\\-](\d{1,2})[\/\\-](\d{2,4})$/);
      if (m) { const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]); return this.validDateParts(y, Number(m[1])-1, Number(m[2])); }
      return '';
    },

    validDateParts(year, monthIndex, day) {
      const d = new Date(year, monthIndex, day);
      return d.getFullYear() === year && d.getMonth() === monthIndex && d.getDate() === day ? `${year}-${String(monthIndex+1).padStart(2,'0')}-${String(day).padStart(2,'0')}` : '';
    },
    normalizeTimeText(value) {
      const m = String(value || '').match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
      if (!m) return '';
      return `${Number(m[1])}:${String(Number(m[2] || 0)).padStart(2,'0')} ${m[3].toUpperCase()}`;
    },
    ordinal(day) { const n = Number(day); if (n % 100 >= 11 && n % 100 <= 13) return 'th'; return ({1:'st',2:'nd',3:'rd'}[n % 10] || 'th'); },

    detectInterest(text) {
      const value = String(text || '');
      if (/(?:high interest|very interested|highly interested|excited|enthusiastic|love (?:it|that)|absolutely|definitely|looking forward|can't wait|strong interest)/i.test(value)) return 'High';
      if (/(?:medium[- ]high|interested|considering|curious|open to|sounds good|that works|okay|sure|willing to|would like|happy to|fine with)/i.test(value)) return 'Medium';
      if (/(?:low interest|not interested|not sure|maybe later|too busy|already have|don't need|not looking|skeptical|reserved|just looking|hesitant)/i.test(value)) return 'Low';
      return 'Not specified';
    },

    buildMeetingNotes(text, meta) {
      const NOT_SPECIFIED = 'Not specified';
      const source = String(text || '').replace(/\r/g, '').trim();
      const lines = source.split('\n').map(v => v.trim()).filter(Boolean);
      const analysisText = lines.filter(line => !/^(?:business\s+name|company\s+name|business|company|organization|firm|full\s+name|contact\s+name|customer\s+name|prospect\s+name|client\s+name|name|role|title|position|job\s+title|designation|phone(?:\s+number)?|mobile|cell|telephone|contact\s+number|email(?:\s+address)?|demo\s+time\s*&\s*date|demo\s+date\s*&\s*time|meeting\s+date\s*&\s*time|meeting\s+time\s*&\s*date)\s*[:=-]/i.test(line)).join(' ');
      const sentences = this.sentences(analysisText);
      const find = (patterns) => sentences.find(sentence => patterns.some(pattern => pattern.test(sentence))) || '';
      const lower = analysisText.toLowerCase();
      const has = (patterns) => patterns.some(pattern => pattern.test(analysisText));
      const strip = (value) => String(value || '').replace(/^[-•*]\s*/, '').trim();

      const role = meta.role && meta.role !== NOT_SPECIFIED ? meta.role : '';
      const attendee = role ? `${role} attending` : (meta.name && meta.name !== NOT_SPECIFIED ? `${meta.name} attending` : NOT_SPECIFIED);

      let currentSetup = NOT_SPECIFIED;
      if (has([/no (?:existing )?website|doesn'?t have (?:a |an )?website|don't have (?:a |an )?website|without (?:a |an )?website/i])) {
        currentSetup = 'No existing website';
      } else if (has([/already has (?:a |an )?website|already have (?:a |an )?website|existing website|current website|has a website|have a website/i])) {
        currentSetup = 'Existing website';
      } else if (has([/facebook|instagram|referral|referrals|word of mouth|social media/i])) {
        const setup = find([/facebook|instagram|referral|referrals|word of mouth|social media/i]);
        currentSetup = setup ? strip(setup) : NOT_SPECIFIED;
      }

      const goal = find([/goal|looking to|want(?:s)? to|need(?:s)?|more customers|more leads|more calls|more bookings|more jobs|easier to contact|contact(?: form| customers)?|online presence|professional presence|showcase|generate leads/i]) || NOT_SPECIFIED;

      const show = find([/show|preview|walkthrough|homepage|home page|service page|services|gallery|reviews|quote form|contact form|lead form|portfolio|project gallery|social integration/i]) || NOT_SPECIFIED;

      const interest = meta.interest || NOT_SPECIFIED;
      const concern = find([/concern|worried|hesitant|however|but\b|already have|another provider|another company|expensive|price|cost|busy|time|think about|not sure|skeptic|skeptical|someone helping|marketing company|current provider|good enough/i]) || NOT_SPECIFIED;

      let meetingAngle = 'Use discovery first and tailor the meeting to the prospect’s stated priorities.';
      if (interest === 'High') meetingAngle = 'Keep the meeting focused, lead with the prospect’s primary goal, and show the strongest relevant features first.';
      if (interest === 'Medium') meetingAngle = 'Use the walkthrough to compare the preview against the prospect’s current setup and priorities.';
      if (interest === 'Low') meetingAngle = 'Use discovery first, show only the strongest improvements, and avoid pushing for a decision.';

      return [
        `Attendees: ${attendee}.`,
        `Current setup: ${currentSetup}.`,
        `Website goal: ${goal}.`,
        `What to show: ${show}.`,
        `Interest and attitude: ${interest}.`,
        `Objection/Concern: ${concern}.`,
        `Meeting angle: ${meetingAngle}`
      ].join('\n');
    },

    bookingFormat(data) {
      return [
        `Business Name: ${data.business}`,
        `Name: ${data.name}`,
        `Role: ${data.role}`,
        `Phone Number: ${data.phone}`,
        `Demo Time & Date: ${data.dateTime}`,
        `Email: ${data.email}`,
        '',
        'Notes for the Developer:',
        '',
        ...data.notes.split('\n').map(line => `- ${line}`)
      ].join('\n');
    },

    resultView() {
      const title = this.baseName(this.state.fileName || 'Transcript');
      const summary = this.state.summaryMode === 'off' ? this.makeSummary(this.state.transcript, 'concise') : this.makeSummary(this.state.transcript, this.state.summaryMode);
      this.state.lastSummary = summary.overview;
      const duration = this.state.audioDuration || (this.state.chunks.length ? this.state.chunks[this.state.chunks.length - 1].end : 0);
      return `
      <div class="ts-pro ts-result-page">
        <div class="ts-result-topbar"><button class="ts-back-btn" id="tsBack"><i class="fas fa-chevron-left"></i></button><div class="ts-result-title"><strong>${this.esc(title)}</strong><button class="ts-history-name" id="tsHistoryName" title="Open transcript history"><i class="fas fa-clock-rotate-left"></i> ${this.esc(this.getCurrentContactName())}</button><span>${this.state.sourceType === 'audio' ? this.formatDuration(duration) : 'Transcript file'}</span></div><div class="ts-result-actions"><button class="ts-icon-btn" id="tsShare" title="Share"><i class="fas fa-share-nodes"></i></button><button class="ts-icon-btn" id="tsMore" title="More"><i class="fas fa-ellipsis"></i></button><button class="ts-export-main" id="tsExportMenu"><i class="fas fa-download"></i> Export</button></div></div><div class="ts-booking-card" id="tsBookingCard"><div class="ts-booking-head"><div><span class="ts-booking-kicker"><i class="fas fa-calendar-check"></i> Booking-ready details</span><h3>Appointment Details</h3><p>Auto-filled from the transcript. Missing details are marked <b>Not specified</b>.</p></div><div class="ts-booking-actions"><button class="ts-mini-btn ts-ai-booking-btn" id="tsAnalyzeBooking" title="Build booking details from the conversation"><i class="fas fa-list-check"></i> <span>Build Booking Details</span></button><button class="ts-mini-btn" id="tsCopyBooking"><i class="far fa-copy"></i> Copy</button><button class="ts-mini-btn" id="tsSendBooking"><i class="fas fa-file-import"></i> Send to Smart Import</button></div></div><textarea id="tsBookingText" class="ts-booking-text" spellcheck="false">${this.esc(this.bookingFormat(this.extractBookingData(this.state.transcript)))}</textarea></div>
        <div class="ts-result-layout">
          <section class="ts-transcript-pane">
            <div class="ts-transcript-toolbar"><div class="ts-transcript-label"><strong>Transcript</strong><span>${this.formatDuration(duration)}</span></div><label class="ts-search"><i class="fas fa-search"></i><input id="tsSearch" placeholder="Search transcript" /></label><button class="ts-icon-btn" id="tsCopy" title="Copy"><i class="far fa-copy"></i></button><button class="ts-icon-btn" id="tsTranslateQuick" title="Translate to English"><i class="fas fa-language"></i></button></div>
            ${this.state.speakerId ? '<div class="ts-speaker-notice"><i class="fas fa-users"></i><span>Speaker labels are editable. Automatic diarization is not guaranteed to identify speakers correctly.</span><button id="tsAddSpeaker">Add label</button></div>' : ''}
            <div class="ts-transcript-scroll" id="tsTranscriptScroll">${this.renderChunks()}</div>
            ${this.audioControls(duration)}
          </section>
          <aside class="ts-analysis-pane">
            <div class="ts-analysis-tabs"><button class="active" data-analysis="summary">Summary</button><button data-analysis="mindmap">Mind Map</button><button data-analysis="insights">Insights</button></div>
            <div id="tsAnalysisBody">${this.summaryPanel(summary)}</div>
          </aside>
        </div>
        <div class="ts-history-drawer" id="tsHistoryDrawer" hidden><div class="ts-history-head"><div><strong>Transcript History</strong><span>Saved transcripts for your account</span></div><button id="tsCloseHistory" class="ts-icon-btn" title="Close"><i class="fas fa-xmark"></i></button></div><div id="tsHistoryList" class="ts-history-list"><div class="ts-history-loading"><i class="fas fa-spinner fa-spin"></i> Loading history…</div></div></div>
        <div class="ts-export-drawer" id="tsExportDrawer" hidden><div><strong>Export transcript</strong><button id="tsCloseExport" class="ts-icon-btn"><i class="fas fa-xmark"></i></button></div><div class="ts-export-grid"><button data-export="txt">TXT</button><button data-export="srt">SRT</button><button data-export="vtt">VTT</button><button data-export="csv">CSV</button><button data-export="doc">Word</button><button data-export="pdf">PDF / Print</button></div></div>
        <audio id="tsAudio" preload="metadata" src="${this.esc(this.state.audioUrl)}"></audio>
      </div>`;
    },

    renderChunks() {
      if (!this.state.chunks.length) return `<div class="ts-text-only">${this.esc(this.state.transcript).replace(/\n/g,'<br>')}</div>`;
      return this.state.chunks.map((c, i) => `<button class="ts-chunk" data-index="${i}" data-start="${c.start}"><time>${this.formatClock(c.start)}</time><span>${this.esc(c.text)}</span></button>`).join('');
    },

    audioControls(duration) {
      if (this.state.sourceType !== 'audio') return '<div class="ts-no-audio"><i class="fas fa-file-lines"></i> Imported transcript — audio controls are unavailable.</div>';
      return `<div class="ts-player"><button id="tsPlay" class="ts-play"><i class="fas fa-play"></i></button><button id="tsRewind" class="ts-player-small">↶ 10</button><div class="ts-player-time"><span id="tsCurrentTime">00:00</span><input id="tsSeek" type="range" min="0" max="${Math.max(1, duration || 1)}" step="0.1" value="0"><span id="tsDuration">${this.formatDuration(duration)}</span></div><button id="tsVolume" class="ts-player-small"><i class="fas fa-volume-high"></i></button><select id="tsSpeed" class="ts-speed"><option>1.0x</option><option>1.25x</option><option>1.5x</option><option>2.0x</option></select></div>`;
    },

    bindResult(container) {
      const audio = container.querySelector('#tsAudio');
      const play = container.querySelector('#tsPlay');
      if (audio) {
        audio.onloadedmetadata = () => { this.state.audioDuration = audio.duration || this.state.audioDuration; const seek=container.querySelector('#tsSeek'); if(seek) seek.max=audio.duration||1; };
        audio.ontimeupdate = () => { const seek=container.querySelector('#tsSeek'); const t=container.querySelector('#tsCurrentTime'); if(seek) seek.value=audio.currentTime; if(t)t.textContent=this.formatClock(audio.currentTime); this.highlightChunk(container,audio.currentTime); };
        audio.onended = () => { if(play) play.innerHTML='<i class="fas fa-play"></i>'; };
      }
      if(play) play.onclick=()=>{if(audio.paused){audio.play();play.innerHTML='<i class="fas fa-pause"></i>';}else{audio.pause();play.innerHTML='<i class="fas fa-play"></i>';}};
      const seek=container.querySelector('#tsSeek'); if(seek) seek.oninput=()=>{audio.currentTime=Number(seek.value);};
      const rewind=container.querySelector('#tsRewind'); if(rewind) rewind.onclick=()=>{audio.currentTime=Math.max(0,audio.currentTime-10);};
      const speed=container.querySelector('#tsSpeed'); if(speed) speed.onchange=()=>{audio.playbackRate=Number(speed.value.replace('x',''));};
      const vol=container.querySelector('#tsVolume'); if(vol) vol.onclick=()=>{audio.muted=!audio.muted;vol.innerHTML=`<i class="fas ${audio.muted?'fa-volume-xmark':'fa-volume-high'}"></i>`;};
      container.querySelectorAll('.ts-chunk').forEach(el=>el.onclick=()=>{this.state.selectedChunkIndex=Number(el.dataset.index||0);audio.currentTime=Number(el.dataset.start||0);audio.play();if(play)play.innerHTML='<i class="fas fa-pause"></i>';});
      const search=container.querySelector('#tsSearch'); if(search) search.oninput=()=>this.filterChunks(container,search.value);
      container.querySelector('#tsCopy').onclick=()=>this.copyText(this.state.transcript);
      const analyzeBooking=container.querySelector('#tsAnalyzeBooking'); if(analyzeBooking) analyzeBooking.onclick=()=>this.analyzeBooking(container, analyzeBooking);
      const bookingCopy=container.querySelector('#tsCopyBooking'); if(bookingCopy) bookingCopy.onclick=()=>this.copyText(container.querySelector('#tsBookingText')?.value||'');
      const bookingSend=container.querySelector('#tsSendBooking'); if(bookingSend) bookingSend.onclick=()=>this.sendBookingToSmartImport(container);
      container.querySelector('#tsBack').onclick=()=>{this.revokeUrl();this.state.phase='upload';this.renderCurrent(container);};
      container.querySelector('#tsShare').onclick=()=>this.shareTranscript();
      const historyName=container.querySelector('#tsHistoryName'); if(historyName) historyName.onclick=()=>this.openHistory(container);
      const closeHistory=container.querySelector('#tsCloseHistory'); if(closeHistory) closeHistory.onclick=()=>this.closeHistory(container);
      container.querySelector('#tsTranslateQuick').onclick=()=>this.quickTranslate(container);
      const add=container.querySelector('#tsAddSpeaker'); if(add)add.onclick=()=>this.addSpeakerLabel(container);
      container.querySelectorAll('[data-analysis]').forEach(tab=>tab.onclick=()=>this.renderAnalysisTab(container,tab.dataset.analysis));
      const exportMenu=container.querySelector('#tsExportMenu'); if(exportMenu)exportMenu.onclick=()=>{container.querySelector('#tsExportDrawer').hidden=false;};
      const closeExport=container.querySelector('#tsCloseExport'); if(closeExport)closeExport.onclick=()=>{container.querySelector('#tsExportDrawer').hidden=true;};
      container.querySelectorAll('[data-export]').forEach(b=>b.onclick=()=>this.export(this.state.transcript,b.dataset.export));
      container.querySelector('#tsMore').onclick=()=>this.moreMenu(container);
      const regen=container.querySelector('#tsRegenerate'); if(regen) regen.onclick=()=>this.renderAnalysisTab(container,'summary');
      const mapExport=container.querySelector('#tsExportMap'); if(mapExport) mapExport.onclick=()=>this.exportMindMap();
    },

    async analyzeBooking(container, button) {
      const transcript = String(this.state.transcript || '').trim();
      const output = container.querySelector('#tsBookingText');
      if (!transcript) {
        if (typeof showToast === 'function') showToast('There is no transcript to analyze yet.', 'warning');
        return;
      }
      if (!output || button?.dataset.busy === 'true') return;

      const originalHtml = button.innerHTML;
      button.dataset.busy = 'true';
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Extracting…</span>';
      output.classList.add('ts-ai-processing');

      const setStatus = (message) => {
        const card = container.querySelector('#tsBookingCard');
        if (!card) return;
        let status = card.querySelector('.ts-ai-status');
        if (!status) {
          status = document.createElement('div');
          status.className = 'ts-ai-status';
          const head = card.querySelector('.ts-booking-head');
          if (head) head.appendChild(status);
        }
        status.innerHTML = `<i class="fas fa-list-check"></i> ${this.esc(message)}`;
      };

      try {
        setStatus('Checking the conversation for appointment details…');
        // Deterministic extraction only. No LLM is loaded and no transcript is sent
        // to a cloud analysis provider. Multiple conservative passes reduce false
        // positives while preserving the exact transcript-supported values.
        const data = this.extractBookingData(transcript);
        const confidence = this.bookingConfidence(data, transcript);
        this.state.aiBooking = data;
        output.value = this.bookingFormat(data);
        output.dispatchEvent(new Event('input', { bubbles: true }));
        await this.saveTranscriptHistory(data);
        const nameButton = container.querySelector('#tsHistoryName');
        if (nameButton) nameButton.innerHTML = `<i class="fas fa-clock-rotate-left"></i> ${this.esc(data.name || 'Not specified')}`;
        setStatus(`Complete. ${confidence.label} extraction — review before sending to Smart Import.`);
        if (typeof showToast === 'function') showToast(`Appointment details prepared from the conversation (${confidence.label.toLowerCase()} confidence).`, 'success');
      } catch (error) {
        console.error('Deterministic booking extraction failed:', error);
        setStatus('Automatic extraction could not be completed. The original transcript-based output is still available.');
        if (typeof showToast === 'function') showToast('The transcript could not be analyzed. Your original booking output is still available.', 'warning');
      } finally {
        output.classList.remove('ts-ai-processing');
        button.dataset.busy = 'false';
        button.disabled = false;
        button.innerHTML = originalHtml;
      }
    },

    bookingConfidence(data, transcript) {
      const NOT = 'Not specified';
      const fields = [data.business, data.name, data.role, data.phone, data.dateTime, data.email];
      const found = fields.filter(v => v && v !== NOT).length;
      const text = String(transcript || '');
      const explicitLabels = (text.match(/\b(?:business name|company name|name|role|phone|email|demo time|demo date|meeting|appointment)\b/gi) || []).length;
      const score = Math.min(100, Math.round((found / fields.length) * 85 + Math.min(explicitLabels, 6) * 2.5));
      return { score, label: score >= 75 ? 'High' : score >= 45 ? 'Medium' : 'Low' };
    },

    sendBookingToSmartImport(container) {
      const text = container.querySelector('#tsBookingText')?.value || this.bookingFormat(this.extractBookingData(this.state.transcript));
      if (!text.trim()) return;

      if (typeof openSmartImportEnhanced === 'function') {
        openSmartImportEnhanced({ source: 'transcript', prefill: text, autoParse: true });
        if (typeof showToast === 'function') showToast('Transcript booking details loaded into Smart Import. Review before saving.', 'success');
        return;
      }

      this.copyText(text);
      if (typeof showToast === 'function') showToast('Booking format copied. Paste it into Smart Import.', 'info');
    },

    getCurrentContactName() {
      const ai = this.state.aiBooking;
      if (ai && ai.name && ai.name !== 'Not specified') return ai.name;
      const data = this.extractBookingData(this.state.transcript);
      return data.name && data.name !== 'Not specified' ? data.name : 'Transcript History';
    },

    historyKey() {
      const user = (typeof AppState !== 'undefined' ? AppState.currentUser : null) || null;
      const id = user?.uid || user?.email || 'offline';
      return `scriptflow_transcript_history_${String(id).replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
    },

    async saveTranscriptHistory(bookingOverride = null) {
      const transcript = String(this.state.transcript || '').trim();
      if (!transcript) return;
      const fallback = this.extractBookingData(transcript);
      const booking = bookingOverride || this.state.aiBooking || fallback;
      const id = this.state.historyId || `th_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
      this.state.historyId = id;
      const now = new Date().toISOString();
      const record = {
        id,
        name: booking.name || fallback.name || 'Not specified',
        business: booking.business || fallback.business || 'Not specified',
        role: booking.role || fallback.role || 'Not specified',
        phone: booking.phone || fallback.phone || 'Not specified',
        email: booking.email || fallback.email || 'Not specified',
        dateTime: booking.dateTime || fallback.dateTime || 'Not specified',
        bookingText: this.bookingFormat(booking.business ? booking : fallback),
        transcript,
        chunks: Array.isArray(this.state.chunks) ? this.state.chunks.map(c => ({ start: Number(c.start)||0, end: Number(c.end)||0, text: String(c.text||'') })) : [],
        fileName: this.state.fileName || 'Transcript',
        sourceType: 'text',
        createdAt: this.state.historyCreatedAt || now,
        updatedAt: now
      };
      this.state.historyCreatedAt = record.createdAt;

      // Fast local history so the user can reopen it even when Firestore is unavailable.
      try {
        const existing = JSON.parse(localStorage.getItem(this.historyKey()) || '[]');
        const index = existing.findIndex(x => x.id === id);
        if (index >= 0) existing[index] = record; else existing.unshift(record);
        localStorage.setItem(this.historyKey(), JSON.stringify(existing.slice(0, 100)));
        this.state.history = existing.slice(0, 100);
      } catch (_) {}

      // Sync once per signed-in user. If Firestore denies this collection, permanently
      // fall back to local history for this session instead of retrying every transcript.
      if (!this.state.historyCloudDisabled) {
        try {
          const user = (typeof AppState !== 'undefined' ? AppState.currentUser : null);
          if (user && typeof firebase !== 'undefined' && firebase.firestore) {
            await firebase.firestore().collection('users').doc(user.uid).collection('transcriptHistory').doc(id).set(record, { merge: true });
            this.state.historyCloudChecked = true;
          }
        } catch (error) {
          const code = String(error?.code || '').toLowerCase();
          if (code.includes('permission-denied') || /missing or insufficient permissions/i.test(String(error?.message || ''))) {
            this.state.historyCloudDisabled = true;
            this.state.historyCloudChecked = true;
            // Local history remains the authoritative fallback until Firestore rules are fixed.
          } else {
            // Network/extension blocking is non-fatal; don't spam the console.
          }
        }
      }
    },

    async loadTranscriptHistory() {
      const local = (() => { try { return JSON.parse(localStorage.getItem(this.historyKey()) || '[]'); } catch (_) { return []; } })();
      this.state.history = Array.isArray(local) ? local : [];
      if (!this.state.historyCloudDisabled) {
        try {
          const user = (typeof AppState !== 'undefined' ? AppState.currentUser : null);
          if (user && typeof firebase !== 'undefined' && firebase.firestore) {
            const snap = await firebase.firestore().collection('users').doc(user.uid).collection('transcriptHistory').orderBy('updatedAt', 'desc').limit(100).get();
            const cloud = [];
            snap.forEach(doc => cloud.push({ ...doc.data(), id: doc.id }));
            const merged = [...cloud, ...this.state.history];
            const byId = new Map(merged.map(item => [item.id, item]));
            this.state.history = Array.from(byId.values()).sort((a,b) => String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,100);
            localStorage.setItem(this.historyKey(), JSON.stringify(this.state.history));
          }
        } catch (error) {
          const code = String(error?.code || '').toLowerCase();
          if (code.includes('permission-denied') || /missing or insufficient permissions/i.test(String(error?.message || ''))) {
            this.state.historyCloudDisabled = true;
          }
          // Keep history usable locally without emitting noisy Firestore warnings.
        }
      }
      this.state.historyLoaded = true;
      return this.state.history;
    },

    async openHistory(container) {
      const drawer = container.querySelector('#tsHistoryDrawer');
      if (!drawer) return;
      drawer.hidden = false;
      drawer.classList.add('open');
      const list = drawer.querySelector('#tsHistoryList');
      if (list) list.innerHTML = '<div class="ts-history-loading"><i class="fas fa-spinner fa-spin"></i> Loading history…</div>';
      const history = await this.loadTranscriptHistory();
      if (!history.length) {
        if (list) list.innerHTML = '<div class="ts-history-empty"><i class="fas fa-clock-rotate-left"></i><strong>No transcript history yet</strong><span>Your completed transcripts will appear here automatically.</span></div>';
        return;
      }
      if (list) list.innerHTML = history.map(item => `
        <button class="ts-history-item ${item.id === this.state.historyId ? 'active' : ''}" data-history-id="${this.esc(item.id)}">
          <span class="ts-history-avatar"><i class="fas fa-user"></i></span>
          <span class="ts-history-meta"><strong>${this.esc(item.name || 'Not specified')}</strong><span>${this.esc(item.business || 'Not specified')}</span><small>${this.esc(item.dateTime || this.formatHistoryDate(item.updatedAt))}</small></span>
          <i class="fas fa-chevron-right"></i>
        </button>`).join('');
      list?.querySelectorAll('[data-history-id]').forEach(btn => btn.onclick = () => this.loadHistoryRecord(btn.dataset.historyId, container));
    },

    closeHistory(container) {
      const drawer = container.querySelector('#tsHistoryDrawer');
      if (drawer) { drawer.hidden = true; drawer.classList.remove('open'); }
    },

    formatHistoryDate(value) {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? 'Saved transcript' : d.toLocaleString([], { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
    },

    async loadHistoryRecord(id, container) {
      const history = await this.loadTranscriptHistory();
      const record = history.find(x => x.id === id);
      if (!record) return;
      this.revokeUrl();
      this.state.historyId = record.id;
      this.state.historyCreatedAt = record.createdAt;
      this.state.fileName = record.fileName || 'Transcript';
      this.state.file = null;
      this.state.audioUrl = '';
      this.state.sourceType = 'text';
      this.state.transcript = String(record.transcript || '');
      this.state.chunks = Array.isArray(record.chunks) && record.chunks.length ? record.chunks : this.chunksFromText(this.state.transcript, 0);
      this.state.aiBooking = {
        business: record.business || 'Not specified', name: record.name || 'Not specified', role: record.role || 'Not specified',
        phone: record.phone || 'Not specified', email: record.email || 'Not specified', dateTime: record.dateTime || 'Not specified',
        notes: 'Attendees: Not specified\nCurrent setup: Not specified\nWebsite goal: Not specified\nWhat to show: Not specified\nInterest and attitude: Not specified\nObjection/Concern: Not specified\nMeeting angle: Not specified'
      };
      this.state.phase = 'result';
      this.closeHistory(container);
      this.renderCurrent(container);
      if (typeof showToast === 'function') showToast(`Loaded transcript for ${record.name || 'Not specified'}.`, 'success');
    },

    renderAnalysisTab(container, tab) {
      container.querySelectorAll('[data-analysis]').forEach(t=>t.classList.toggle('active',t.dataset.analysis===tab));
      const body=container.querySelector('#tsAnalysisBody');
      if(tab==='summary') body.innerHTML=this.summaryPanel(this.makeSummary(this.state.transcript,this.state.summaryMode==='detailed'?'detailed':'concise'));
      if(tab==='mindmap') body.innerHTML=this.mindmapPanel(this.state.transcript);
      if(tab==='insights') body.innerHTML=this.insightsPanel(this.state.transcript);
    },

    summaryPanel(s) {
      return `<div class="ts-analysis-card"><div class="ts-analysis-heading"><i class="fas fa-sparkles"></i><strong>Summary</strong><button id="tsRegenerate" class="ts-mini-btn">Regenerate</button></div><div class="ts-skeleton-content"><h4>Overview</h4><p>${this.esc(s.overview)}</p><h4>Key Points</h4>${this.listHtml(s.points)}<h4>Takeaways</h4>${this.listHtml(s.takeaways)}</div></div>`;
    },
    mindmapPanel(text) {
      const topics=this.topTopics(text,7); return `<div class="ts-analysis-card"><div class="ts-analysis-heading"><i class="fas fa-project-diagram"></i><strong>Mind Map</strong><button class="ts-mini-btn" id="tsExportMap">Export</button></div><div class="ts-mindmap-pro"><div class="ts-map-root">Conversation</div><div class="ts-map-grid">${topics.map(t=>`<div class="ts-map-node"><i class="fas fa-arrow-right"></i>${this.esc(t)}</div>`).join('') || '<div class="ts-muted">No strong topics detected.</div>'}</div></div></div>`;
    },
    insightsPanel(text) {
      const s=this.makeInsights(text); return `<div class="ts-analysis-card"><div class="ts-analysis-heading"><i class="fas fa-lightbulb"></i><strong>Key Insights</strong></div><div class="ts-insight-block"><h4>Questions</h4>${this.listHtml(s.questions)}</div><div class="ts-insight-block"><h4>Action Items</h4>${this.listHtml(s.actions)}</div><div class="ts-insight-block"><h4>Potential Objections</h4>${this.listHtml(s.objections)}</div></div>`;
    },

    makeSummary(text,mode) {
      const sentences=this.sentences(text); if(!sentences.length)return{overview:'No transcript available.',points:[],takeaways:[]};
      const limit=mode==='detailed'?8:4; const points=sentences.slice(0,Math.min(limit,sentences.length));
      const take=this.makeInsights(text).actions.slice(0,3);
      return {overview:sentences.slice(0,mode==='detailed'?3:2).join(' '),points,takeaways:take.length?take:['Review the conversation and confirm the next step.']};
    },
    makeInsights(text){
      const s=this.sentences(text); return {
        questions:s.filter(x=>x.includes('?')).slice(0,6),
        actions:s.filter(x=>/\b(need|should|will|send|call|schedule|follow.?up|next step|confirm|email|book|review)\b/i.test(x)).slice(0,6),
        objections:s.filter(x=>/\b(but|however|concern|expensive|price|cost|not sure|already have|think about|permission|consent|too busy|maybe later|no budget)\b/i.test(x)).slice(0,6)
      };
    },
    topTopics(text,count){
      const stop=new Set('about after again against among also because before being between could does doing during each from further have having here how into just like more most other over really should some than that their there these they this those through under very what when where which while with would your you about website business customer customers meeting demo service services call calls'.split(' '));
      const words=(text.toLowerCase().match(/[a-z][a-z'-]{4,}/g)||[]).filter(w=>!stop.has(w));const freq={};words.forEach(w=>freq[w]=(freq[w]||0)+1);return Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,count).map(x=>x[0]);
    },
    listHtml(a){return a&&a.length?`<ul>${a.map(x=>`<li>${this.esc(x)}</li>`).join('')}</ul>`:'<p class="ts-muted">None detected.</p>';},
    sentences(t){return String(t||'').replace(/\s+/g,' ').split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(x=>x.length>8);},

    filterChunks(container,q){const query=q.trim().toLowerCase();container.querySelectorAll('.ts-chunk').forEach(el=>{el.hidden=!!query&&!el.textContent.toLowerCase().includes(query);});},
    highlightChunk(container,time){let best=-1;this.state.chunks.forEach((c,i)=>{if(time>=c.start&&(c.end===0||time<=c.end))best=i;});container.querySelectorAll('.ts-chunk').forEach((el,i)=>el.classList.toggle('playing',i===best));},
    addSpeakerLabel(container){
      const idx=Math.max(0,Math.min(this.state.selectedChunkIndex,this.state.chunks.length-1));
      const chunk=this.state.chunks[idx];
      if(!chunk)return;
      const label=window.prompt('Speaker label for this segment:', 'Speaker 1');
      if(!label)return;
      chunk.text=`${label.trim()}: ${chunk.text.replace(/^[^:]{1,40}:\s*/,'')}`;
      this.state.transcript=this.state.chunks.map(x=>x.text).join(' ');
      const scroll=container.querySelector('#tsTranscriptScroll');
      if(scroll)scroll.innerHTML=this.renderChunks();
      this.bindResult(container);
    },
    async quickTranslate(container){
      if(!this.state.transcript||!this.state.file){if(typeof showToast==='function')showToast('Translation requires the original audio file.','info');return;}
      const button=container.querySelector('#tsTranslateQuick');if(!button)return;button.disabled=true;button.classList.add('loading');button.innerHTML='<i class="fas fa-spinner fa-spin"></i>';
      try{const form=new FormData();form.append('file',this.state.file,this.state.file.name||'audio');form.append('format','json');form.append('keep_wav','false');form.append('model',WORKSPACE_MODELS[this.state.model]||WORKSPACE_MODELS.fast);form.append('translate','true');if(this.state.language!=='auto')form.append('language',this.state.language);const result=await this.uploadTranscription(form,null,()=>{});this.applyFastApiResult(result);this.state.translate=true;container.innerHTML=this.resultView();this.bindResult(container);if(typeof showToast==='function')showToast('English translation generated by the workspace service.','success');}catch(err){if(typeof showToast==='function')showToast(this.friendlyTranscriptionError(err),'error');}finally{button.disabled=false;button.classList.remove('loading');}
    },
    exportMindMap(){
      const topics=this.topTopics(this.state.transcript,8);
      const data=['ScriptFlow Pro Mind Map','',`Conversation -> ${topics.join(' | ')}`].join('\n');
      const blob=new Blob([data],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${this.slug(this.baseName(this.state.fileName))||'transcript'}-mind-map.txt`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    },
    async shareTranscript(){
      const text=this.state.transcript; if(navigator.share){try{await navigator.share({title:this.baseName(this.state.fileName),text});return;}catch(_){} }
      await this.copyText(text); if(typeof showToast==='function')showToast('Transcript copied to clipboard.','success');
    },
    moreMenu(container){
      const drawer=container.querySelector('#tsExportDrawer'); if(drawer){drawer.hidden=false;}
    },

    export(text,type){
      if(!String(text||'').trim()){if(typeof showToast==='function')showToast('No transcript to export.','info');return;}
      let data='',ext=type,mime='text/plain;charset=utf-8';
      if(type==='txt'){data=text;}
      if(type==='csv'){data='"Start","End","Text"\n'+this.state.chunks.map(c=>`"${this.formatClock(c.start)}","${this.formatClock(c.end)}","${String(c.text).replace(/"/g,'""')}"`).join('\n');mime='text/csv;charset=utf-8';}
      if(type==='srt'){data=this.toSrt();mime='application/x-subrip;charset=utf-8';}
      if(type==='vtt'){data='WEBVTT\n\n'+this.state.chunks.map(c=>`${this.vttTime(c.start)} --> ${this.vttTime(c.end||c.start+3)}\n${c.text}`).join('\n\n');mime='text/vtt;charset=utf-8';}
      if(type==='doc'){data=`<!doctype html><html><body><h1>${this.esc(this.baseName(this.state.fileName))}</h1><p>${this.esc(this.lastSummary||'')}</p><pre>${this.esc(text)}</pre></body></html>`;mime='application/msword';}
      if(type==='pdf'){this.print(text,this.lastSummary);return;}
      const blob=new Blob([data],{type:mime});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${this.slug(this.baseName(this.state.fileName)) || 'scriptflow-transcript'}.${ext}`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    },
    toSrt(){return this.state.chunks.map((c,i)=>`${i+1}\n${this.srtTime(c.start)} --> ${this.srtTime(c.end||c.start+3)}\n${c.text}`).join('\n\n');},
    print(text,summary){const w=window.open('','_blank','width=960,height=720');if(!w){if(typeof showToast==='function')showToast('Please allow pop-ups to export PDF/print.','info');return;}w.document.write(`<html><head><title>ScriptFlow Transcript</title><style>body{font-family:Arial,sans-serif;padding:36px;line-height:1.55;color:#111}h1{margin:0 0 6px}section{margin:22px 0;padding:16px;background:#f4f4f5;border-radius:10px}pre{white-space:pre-wrap;font:14px/1.6 Arial}</style></head><body><h1>${this.esc(this.baseName(this.state.fileName))}</h1><section><b>Summary</b><p>${this.esc(summary||'')}</p></section><h2>Transcript</h2><pre>${this.esc(text)}</pre><script>window.onload=function(){window.print()}<\/script></body></html>`);w.document.close();},

    cleanTranscript(t){return String(t||'').replace(/^WEBVTT.*$/gim,'').replace(/^\d+\s*$/gm,'').replace(/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*.*$/gm,'').replace(/\r/g,'').replace(/^\s*$/gm,'').trim();},
    uploadError(c,msg){const e=c&&c.querySelector('#tsUploadError');if(!e)return;e.hidden=!msg;e.textContent=msg||'';},
    friendlyError(e){const m=String(e&&e.message||e||'Unknown error');if(/decode|audio|unsupported|AudioContext/i.test(m))return 'Your browser could not decode this audio format. Try OGG/Opus, WAV, MP3, M4A, or convert the file to WAV and retry.';if(/memory|out of memory/i.test(m))return 'This recording is too large for the current browser memory. Try the Fast model or split the recording into shorter files.';if(/network|fetch|load|cdn|model/i.test(m))return 'The AI model could not be loaded. Check your internet connection and try again.';return m;},
    modelLabel(){return this.state.model==='fast'?'Fast · Whisper Tiny':this.state.model==='accurate'?'Higher accuracy · Whisper Small':'Balanced · Whisper Base';},
    formatBytes(n){if(!n)return '0 B';const u=['B','KB','MB','GB'];const i=Math.min(Math.floor(Math.log(n)/Math.log(1024)),u.length-1);return `${(n/Math.pow(1024,i)).toFixed(i?1:0)} ${u[i]}`;},
    formatDuration(sec){if(!isFinite(sec)||sec<0)return '00:00';const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=Math.floor(sec%60);return h?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;},
    formatClock(sec){return this.formatDuration(sec);},
    srtTime(sec){const s=Math.max(0,Number(sec)||0);const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=Math.floor(s%60),ms=Math.floor((s-Math.floor(s))*1000);return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')},${String(ms).padStart(3,'0')}`;},
    vttTime(sec){return this.srtTime(sec).replace(',', '.');},
    baseName(n){return String(n||'Transcript').replace(/\.[^.]+$/,'');}, slug(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');},
    extFromUrl(u){try{const p=new URL(u).pathname.match(/\.[a-z0-9]{2,5}$/i);return p?p[0]:'';}catch(_){return '';}},
    extFromMime(m){const map={'audio/ogg':'.ogg','audio/opus':'.opus','audio/wav':'.wav','audio/mpeg':'.mp3','audio/mp4':'.m4a','video/mp4':'.mp4','audio/webm':'.webm','video/webm':'.webm'};return map[m]||'';},
    async copyText(text){try{await navigator.clipboard.writeText(text);if(typeof showToast==='function')showToast('Copied to clipboard.','success');}catch(_){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}},
    revokeUrl(){if(this.state.audioUrl&&this.state.audioUrl.startsWith('blob:'))URL.revokeObjectURL(this.state.audioUrl);this.state.audioUrl='';},
    esc(s){const d=document.createElement('div');d.textContent=String(s??'');return d.innerHTML;}
  };

  window.TranscriptStudio = Studio;
  document.addEventListener('DOMContentLoaded', () => Studio.init());
})();
