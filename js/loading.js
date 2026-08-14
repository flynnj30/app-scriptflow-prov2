// ================================================================
// LOADING MODULE - CENTRALIZED LOADING SCREEN MANAGEMENT
// ================================================================

const LoadingManager = {
    state: {
        isVisible: true,
        progress: 0,
        steps: [
            { id: 'init', label: 'Initializing...', progress: 10 },
            { id: 'firebase', label: 'Connecting to Firebase...', progress: 25 },
            { id: 'auth', label: 'Checking authentication...', progress: 40 },
            { id: 'data', label: 'Loading your data...', progress: 60 },
            { id: 'scripts', label: 'Loading scripts...', progress: 75 },
            { id: 'calendar', label: 'Preparing calendar...', progress: 85 },
            { id: 'features', label: 'Loading features...', progress: 95 },
            { id: 'complete', label: 'Ready!', progress: 100 }
        ],
        currentStepIndex: 0,
        intervalId: null,
        onComplete: null,
        isComplete: false,
        isStarted: false,
        isHidden: false
    },

    init: function() {
        const loadingScreen = document.getElementById('loadingScreen');
        if (!loadingScreen) {
            console.warn('Loading screen not found');
            return this;
        }
        
        loadingScreen.style.display = 'flex';
        loadingScreen.style.opacity = '1';
        loadingScreen.style.visibility = 'visible';
        loadingScreen.style.pointerEvents = 'auto';
        
        this.updateProgress(0, 'Starting ScriptFlow Pro...');
        console.log('🎯 Loading Manager initialized');
        return this;
    },

    updateProgress: function(percent, message) {
        const progressBar = document.getElementById('loadingProgress');
        const loadingSubtitle = document.querySelector('.loading-subtitle');
        
        if (progressBar) {
            progressBar.style.width = Math.min(percent, 100) + '%';
            progressBar.style.transition = 'width 0.5s ease';
        }
        
        if (loadingSubtitle && message) {
            loadingSubtitle.textContent = message;
            loadingSubtitle.style.color = '';
        }
        
        this.state.progress = Math.min(percent, 100);
        return this;
    },

    nextStep: function() {
        const steps = this.state.steps;
        const currentIndex = this.state.currentStepIndex;
        
        if (currentIndex < steps.length) {
            const step = steps[currentIndex];
            this.updateProgress(step.progress, step.label);
            this.state.currentStepIndex = currentIndex + 1;
            return true;
        }
        return false;
    },

    start: function(onComplete) {
        if (this.state.isStarted) return this;
        this.state.isStarted = true;
        this.state.onComplete = onComplete || null;
        this.state.currentStepIndex = 0;
        this.state.isComplete = false;
        this.state.isHidden = false;
        
        if (this.state.intervalId) {
            clearInterval(this.state.intervalId);
            this.state.intervalId = null;
        }
        
        this.nextStep();
        
        this.state.intervalId = setInterval(() => {
            const hasMore = this.nextStep();
            if (!hasMore) {
                clearInterval(this.state.intervalId);
                this.state.intervalId = null;
                this.complete();
            }
        }, 500);
        
        return this;
    },

    complete: function() {
        if (this.state.isComplete || this.state.isHidden) return this;
        this.state.isComplete = true;
        
        const loadingScreen = document.getElementById('loadingScreen');
        const appWrapper = document.getElementById('appWrapper');
        
        this.updateProgress(100, 'Ready! 🚀');
        
        if (loadingScreen) {
            loadingScreen.style.opacity = '0';
            loadingScreen.style.transition = 'opacity 0.4s ease';
            loadingScreen.style.pointerEvents = 'none';
            
            setTimeout(() => {
                loadingScreen.style.display = 'none';
                loadingScreen.style.visibility = 'hidden';
                this.state.isHidden = true;
                this.state.isVisible = false;
            }, 450);
        }
        
        if (appWrapper) {
            appWrapper.style.display = 'flex';
            appWrapper.style.opacity = '1';
        }
        
        if (typeof this.state.onComplete === 'function') {
            try {
                this.state.onComplete();
            } catch (e) {
                console.warn('Loading complete callback error:', e);
            }
        }
        
        console.log('✅ Loading complete');
        return this;
    },

    forceComplete: function() {
        if (this.state.intervalId) {
            clearInterval(this.state.intervalId);
            this.state.intervalId = null;
        }
        
        const loadingScreen = document.getElementById('loadingScreen');
        const appWrapper = document.getElementById('appWrapper');
        
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
            loadingScreen.style.visibility = 'hidden';
            loadingScreen.style.opacity = '0';
            this.state.isHidden = true;
            this.state.isVisible = false;
        }
        
        if (appWrapper) {
            appWrapper.style.display = 'flex';
            appWrapper.style.opacity = '1';
        }
        
        this.state.isComplete = true;
        this.state.isStarted = true;
        
        console.log('✅ Loading force completed');
        return this;
    },

    showError: function(message) {
        const loadingSubtitle = document.querySelector('.loading-subtitle');
        const loadingIcon = document.querySelector('.loading-icon');
        const loadingTitle = document.querySelector('.loading-title');
        
        if (loadingSubtitle) {
            loadingSubtitle.textContent = '⚠️ ' + message;
            loadingSubtitle.style.color = 'var(--danger)';
        }
        
        if (loadingIcon) {
            loadingIcon.textContent = '⚠️';
        }
        
        if (loadingTitle) {
            loadingTitle.textContent = 'Error Loading';
        }
        
        const loadingContent = document.querySelector('.loading-content');
        if (loadingContent && !loadingContent.querySelector('.retry-btn')) {
            const retryBtn = document.createElement('button');
            retryBtn.className = 'btn-icon retry-btn';
            retryBtn.style.cssText = 'margin-top:16px; background:var(--primary); color:white; padding:8px 24px; border-radius:40px; cursor:pointer; border:none; font-weight:600;';
            retryBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Retry';
            retryBtn.onclick = function() {
                location.reload();
            };
            loadingContent.appendChild(retryBtn);
        }
        
        console.error('Loading error:', message);
        return this;
    },

    setMessage: function(message) {
        const loadingSubtitle = document.querySelector('.loading-subtitle');
        if (loadingSubtitle) {
            loadingSubtitle.textContent = message;
            loadingSubtitle.style.color = '';
        }
        return this;
    },

    getProgress: function() {
        return this.state.progress;
    },

    isComplete: function() {
        return this.state.isComplete;
    },
    
    isHidden: function() {
        return this.state.isHidden;
    }
};

window.LoadingManager = LoadingManager;

console.log('📦 Loading module initialized');