// --- CORE ARCHITECTURE ROUTER & SYSTEM LAYER ---
const arcadeApp = {
    activeGame: 'arcade-lobby',
    titles: {
        'arcade-lobby': { title: 'MGames', sub: 'Select a game to play' },
        'game-flag': { title: 'Guess the Flag', sub: 'Identify the country' },
        'game-ttt': { title: 'Tic-Tac-Toe', sub: 'Get 3 in a row' },
        'game-memory': { title: 'Memory Match', sub: 'Find the pairs' },
        'game-snake': { title: 'Retro Snake', sub: 'Eat apples, avoid walls' },
        'game-highlow': { title: 'High-Low', sub: 'Guess the number' },
        'game-flappy': { title: 'Flappy Pixel', sub: 'Flap through obstacle pipes' }
    },

    init() {
        this.themeToggle = document.getElementById('theme-toggle');
        this.homeBtn = document.getElementById('home-btn');
        this.titleEl = document.getElementById('app-title');
        this.subtitleEl = document.getElementById('app-subtitle');
        this.lobbyCards = document.querySelectorAll('.lobby-card');
        this.sections = document.querySelectorAll('.game-section');

        this.initTheme();
        this.bindGlobalEvents();
        flagGame.preloadInitial(); 
        
        // Push initial state so going back from first game works
        history.replaceState({ page: 'arcade-lobby' }, "", "#arcade-lobby");
    },

    initTheme() {
        const savedTheme = localStorage.getItem('arcade_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
        this.syncCanvasTheme();
    },

    // Caches the current --canvas-bg custom property so canvas-based games (Snake, Flappy)
    // can repaint with the correct theme color without querying computed styles every frame.
    syncCanvasTheme() {
        this.canvasBg = getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim() || '#050507';
    },

    bindGlobalEvents() {
        this.themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const target = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', target);
            this.themeToggle.textContent = target === 'dark' ? '☀️' : '🌙';
            localStorage.setItem('arcade_theme', target);
            this.syncCanvasTheme();
        });

        this.homeBtn.addEventListener('click', () => {
            this.navigate('arcade-lobby');
        });

        this.lobbyCards.forEach(card => {
            card.addEventListener('click', () => {
                const target = card.getAttribute('data-target');
                this.navigate(target);
            });
        });

        // Mobile gesture swipe-back compatibility
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.page) {
                this.switchView(e.state.page);
            } else {
                this.switchView('arcade-lobby');
            }
        });
    },

    navigate(targetId) {
        history.pushState({ page: targetId }, "", `#${targetId}`);
        this.switchView(targetId);
    },

    switchView(targetId) {
        this.cleanupActiveLoops();
        this.activeGame = targetId;

        this.sections.forEach(sec => sec.classList.add('hidden'));
        const activeSection = document.getElementById(targetId);
        activeSection.classList.remove('hidden');
        
        // Trigger structural hardware animation re-flow
        activeSection.classList.remove('animate-fade-in');
        void activeSection.offsetWidth; 
        activeSection.classList.add('animate-fade-in');

        this.titleEl.textContent = this.titles[targetId].title;
        this.subtitleEl.textContent = this.titles[targetId].sub;

        if (targetId === 'arcade-lobby') {
            this.homeBtn.classList.add('hidden');
        } else {
            this.homeBtn.classList.remove('hidden');
            this.bootstrapGame(targetId);
        }
    },

    bootstrapGame(id) {
        if (id === 'game-flag') flagGame.start();
        if (id === 'game-ttt') tttGame.start();
        if (id === 'game-memory') memoryGame.start();
        if (id === 'game-snake') snakeGame.start();
        if (id === 'game-highlow') highLowGame.start();
        if (id === 'game-flappy') flappyGame.start();
    },

    cleanupActiveLoops() {
        snakeGame.teardown();
        flappyGame.teardown();
    }
};

// --- GAME 1: GUESS THE FLAG ---
const flagGame = {
    countryPool: [], remainingCountries: [], currentQuestion: null, score: 0, loaded: false,
    fallbackCountries: [
        { name: "Argentina", code: "ar" }, { name: "Australia", code: "au" }, 
        { name: "Brazil", code: "br" }, { name: "Canada", code: "ca" }, 
        { name: "France", code: "fr" }, { name: "Germany", code: "de" }, 
        { name: "India", code: "in" }, { name: "Japan", code: "jp" }, 
        { name: "Mexico", code: "mx" }, { name: "Pakistan", code: "pk" }, 
        { name: "United Kingdom", code: "gb" }, { name: "United States", code: "us" }
    ].map(item => ({ name: item.name, acceptedNames: [item.name.toLowerCase()], flagUrl: `https://flagcdn.com/w320/${item.code}.png` })),

    preloadInitial() {
        this.els = {
            image: document.getElementById('flag-image'), loading: document.getElementById('loading-container'),
            overlay: document.getElementById('completion-overlay'), input: document.getElementById('country-input'),
            submitBtn: document.getElementById('submit-btn'), nextBtn: document.getElementById('next-btn'),
            feedbackBox: document.getElementById('feedback-box'), feedbackText: document.getElementById('feedback-text'),
            closestMatch: document.getElementById('closest-match-text'), score: document.getElementById('score'),
            progFill: document.getElementById('progress-fill'), progCount: document.getElementById('progress-count'),
            form: document.getElementById('guess-form')
        };
        
        this.els.form.addEventListener('submit', (e) => { e.preventDefault(); this.submit(); });
        this.els.nextBtn.addEventListener('click', () => this.nextRound());
        this.fetchData();
    },

    async fetchData() {
        try {
            const res = await fetch('https://restcountries.com/v3.1/all');
            if (!res.ok) throw new Error();
            const data = await res.json();
            this.countryPool = data.map(item => ({
                name: item.name.common,
                acceptedNames: [
                    item.name.common.toLowerCase(), 
                    ...(item.name.official ? [item.name.official.toLowerCase()] : []), 
                    ...(item.altSpellings ? item.altSpellings.map(s => s.toLowerCase()) : [])
                ],
                flagUrl: item.flags.png || item.flags.svg
            })).filter(c => c.name && c.flagUrl && c.name.toLowerCase() !== 'israel');
        } catch {
            this.countryPool = [...this.fallbackCountries];
        } finally {
            this.loaded = true;
            this.els.loading.classList.add('hidden');
            this.els.image.classList.remove('hidden-opacity');
            this.resetPool();
            
            // Fix: Kickstart the round if the user is already on the flag game view
            if (arcadeApp.activeGame === 'game-flag') {
                this.start();
            }
        }
    },

    resetPool() {
        this.remainingCountries = [...this.countryPool];
        for (let i = this.remainingCountries.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.remainingCountries[i], this.remainingCountries[j]] = [this.remainingCountries[j], this.remainingCountries[i]];
        }
    },

    start() {
        if (this.loaded && !this.currentQuestion) this.nextRound();
    },

    nextRound() {
        this.els.feedbackBox.className = "feedback-box hidden";
        this.els.nextBtn.classList.add('hidden'); this.els.submitBtn.classList.remove('hidden');
        this.els.overlay.classList.add('hidden');
        this.els.input.disabled = false; this.els.input.value = "";
        this.els.submitBtn.disabled = false;
        
        if (window.innerWidth > 600) this.els.input.focus();

        if (this.remainingCountries.length === 0) {
            this.els.overlay.classList.remove('hidden'); this.resetPool();
            setTimeout(() => this.nextRound(), 1800); return;
        }

        this.currentQuestion = this.remainingCountries.pop();
        this.els.image.classList.add('hidden-opacity');
        this.els.image.onload = () => this.els.image.classList.remove('hidden-opacity');
        this.els.image.src = this.currentQuestion.flagUrl;

        const seenCount = this.countryPool.length - this.remainingCountries.length;
        this.els.progCount.textContent = `${seenCount}/${this.countryPool.length}`;
        this.els.progFill.style.width = `${(seenCount / this.countryPool.length) * 100}%`;
    },

    similarity(str1, str2) {
        const s1 = str1.toLowerCase().trim(), s2 = str2.toLowerCase().trim();
        const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
        for (let i = 0; i <= s1.length; i++) track[0][i] = i;
        for (let j = 0; j <= s2.length; j++) track[j][0] = j;
        for (let j = 1; j <= s2.length; j++) {
            for (let i = 1; i <= s1.length; i++) {
                const ind = s1[i - 1] === s2[j - 1] ? 0 : 1;
                track[j][i] = Math.min(track[j][i - 1] + 1, track[j - 1][i] + 1, track[j - 1][i - 1] + ind);
            }
        }
        const maxLen = Math.max(s1.length, s2.length);
        return maxLen === 0 ? 1.0 : (maxLen - track[s2.length][s1.length]) / maxLen;
    },

    submit() {
        const guess = this.els.input.value.trim();
        if (!guess || this.els.input.disabled) return;

        this.els.input.disabled = true;
        this.els.submitBtn.classList.add('hidden'); this.els.nextBtn.classList.remove('hidden');

        let bestAcc = 0;
        this.currentQuestion.acceptedNames.forEach(n => bestAcc = Math.max(bestAcc, this.similarity(guess, n)));

        if (bestAcc >= 0.82) {
            this.score++; this.els.score.textContent = this.score;
            this.els.feedbackBox.className = "feedback-box correct"; this.els.feedbackText.textContent = "✓ Correct!";
            this.els.closestMatch.textContent = bestAcc < 1.0 ? `Accepted: ${this.currentQuestion.name}` : "";
        } else {
            this.score = 0; this.els.score.textContent = this.score;
            this.els.feedbackBox.className = "feedback-box wrong"; this.els.feedbackText.textContent = "✕ Wrong";
            this.els.closestMatch.textContent = `It was: ${this.currentQuestion.name}`;
        }
    }
};

// --- GAME 2: TIC-TAC-TOE ---
const tttGame = {
    board: Array(9).fill(null), player: 'X', active: true, mode: 'pvp', binded: false,

    start() {
        if (!this.binded) {
            this.cells = document.querySelectorAll('.ttt-cell');
            this.feedback = document.getElementById('ttt-feedback');
            this.modeSelect = document.getElementById('ttt-mode');
            document.getElementById('ttt-reset').addEventListener('click', () => this.reset());
            this.modeSelect.addEventListener('change', (e) => { this.mode = e.target.value; this.reset(); });
            this.cells.forEach(c => c.addEventListener('click', () => this.cellClick(c.dataset.index)));
            this.binded = true;
        }
        this.reset();
    },

    cellClick(idx) {
        if (!this.active || this.board[idx]) return;
        
        // Block interaction if bot processing loop is active
        if (this.mode !== 'pvp' && this.player === 'O') return;
        
        this.commitMove(idx, this.player);
        
        if (this.active && this.mode !== 'pvp' && this.player === 'O') {
            setTimeout(() => this.engineMove(), 280);
        }
    },

    commitMove(idx, symbol) {
        this.board[idx] = symbol;
        this.cells[idx].textContent = symbol;
        this.cells[idx].classList.add(symbol.toLowerCase());

        if (this.checkWin(this.board, symbol)) {
            let winBanner = this.mode === 'pvp' ? `Player ${symbol} Won! 🎉` : (symbol === 'X' ? 'You Won! 🎉' : 'Bot Won! 🤖');
            this.end(winBanner, symbol === 'X' ? 'correct' : 'wrong');
        } else if (this.board.every(b => b !== null)) {
            this.end("Draw! 🤝", "wrong");
        } else {
            this.player = this.player === 'X' ? 'O' : 'X';
        }
    },

    engineMove() {
        if (!this.active) return;
        let choice;
        const available = this.board.map((v, i) => v === null ? i : null).filter(v => v !== null);
        
        if (this.mode === 'easy') {
            choice = available[Math.floor(Math.random() * available.length)];
        } else {
            choice = this.minimax([...this.board], 'O').index;
        }
        if (choice !== undefined && choice !== null) this.commitMove(choice, 'O');
    },

    minimax(virtualBoard, currentAgent) {
        const free = virtualBoard.map((v, i) => v === null ? i : null).filter(v => v !== null);
        if (this.checkWin(virtualBoard, 'X')) return { score: -10 };
        if (this.checkWin(virtualBoard, 'O')) return { score: 10 };
        if (free.length === 0) return { score: 0 };

        const scenarios = [];
        for (let i = 0; i < free.length; i++) {
            const index = free[i];
            const originalValue = virtualBoard[index];
            virtualBoard[index] = currentAgent;

            const scoreOutcome = currentAgent === 'O' 
                ? this.minimax(virtualBoard, 'X').score 
                : this.minimax(virtualBoard, 'O').score;

            virtualBoard[index] = originalValue; 
            scenarios.push({ index, score: scoreOutcome });
        }

        let dynamicIndex = currentAgent === 'O' ? -10000 : 10000;
        let targetedMove = 0;

        for (let i = 0; i < scenarios.length; i++) {
            if (currentAgent === 'O') {
                if (scenarios[i].score > dynamicIndex) { dynamicIndex = scenarios[i].score; targetedMove = i; }
            } else {
                if (scenarios[i].score < dynamicIndex) { dynamicIndex = scenarios[i].score; targetedMove = i; }
            }
        }
        return scenarios[targetedMove];
    },

    checkWin(b, p) {
        const paths = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
        return paths.some(path => path.every(cellIdx => b[cellIdx] === p));
    },

    end(msg, statusClass) {
        this.active = false;
        this.feedback.textContent = msg;
        this.feedback.className = `feedback-box ${statusClass}`;
        this.feedback.classList.remove('hidden');
    },

    reset() {
        this.board.fill(null); this.player = 'X'; this.active = true;
        this.feedback.className = "feedback-box hidden";
        this.cells.forEach(c => { c.textContent = ""; c.className = "ttt-cell"; });
    }
};

// --- GAME 3: MEMORY MATCH ---
const memoryGame = {
    icons: ['🚀','🎮','🔥','🍕','🎸','👻','🥑','👽'],
    deck: [], open: [], resolved: 0, actions: 0, lock: false, binded: false,

    start() {
        if (!this.binded) {
            this.grid = document.getElementById('memory-grid');
            this.movesEl = document.getElementById('memory-moves');
            this.feedback = document.getElementById('memory-feedback');
            document.getElementById('memory-reset').addEventListener('click', () => this.start());
            this.binded = true;
        }
        this.buildDeck();
    },

    buildDeck() {
        this.grid.innerHTML = ""; this.open = []; this.resolved = 0; this.actions = 0; this.lock = false;
        this.movesEl.textContent = "0"; this.feedback.classList.add('hidden');
        this.deck = [...this.icons, ...this.icons].sort(() => Math.random() - 0.5);

        this.deck.forEach((emoji, index) => {
            const element = document.createElement('div');
            element.className = "memory-card"; element.dataset.index = index;
            element.innerHTML = `
                <div class="memory-face memory-front"></div>
                <div class="memory-face memory-back">${emoji}</div>
            `;
            element.addEventListener('click', () => this.reveal(element, emoji));
            this.grid.appendChild(element);
        });
    },

    reveal(card, symbol) {
        if (this.lock || card.classList.contains('flipped') || this.open.length >= 2) return;
        card.classList.add('flipped');
        this.open.push({ card, symbol });

        if (this.open.length === 2) {
            this.actions++; this.movesEl.textContent = this.actions;
            this.lock = true;
            setTimeout(() => this.evaluate(), 600);
        }
    },

    evaluate() {
        const [first, second] = this.open;
        if (first.symbol === second.symbol) {
            this.resolved += 2;
            if (this.resolved === this.deck.length) this.feedback.classList.remove('hidden');
        } else {
            first.card.classList.remove('flipped'); second.card.classList.remove('flipped');
        }
        this.open = []; this.lock = false;
    }
};

// --- GAME 4: RETRO SNAKE ---
const snakeGame = {
    ctx: null, pulse: null, trail: [], apple: {}, dx: 15, dy: 0, points: 0, size: 15, binded: false,
    touchStartX: 0, touchStartY: 0,

    start() {
        if (!this.binded) {
            this.canvas = document.getElementById('snake-canvas');
            this.ctx = this.canvas.getContext('2d');
            this.boardScore = document.getElementById('snake-score');
            this.overlay = document.getElementById('snake-overlay');
            
            document.getElementById('snake-start').addEventListener('click', () => this.launch());
            document.addEventListener('keydown', (e) => this.interceptKeys(e));

            // On-screen D-pad controls (touch/mobile-friendly alternative to keyboard arrows)
            const dpadMap = { 'snake-up': 'UP', 'snake-down': 'DOWN', 'snake-left': 'LEFT', 'snake-right': 'RIGHT' };
            Object.keys(dpadMap).forEach(btnId => {
                document.getElementById(btnId).addEventListener('click', () => {
                    if (this.overlay.classList.contains('hidden') === false) return;
                    this.redirect(dpadMap[btnId]);
                });
            });

            // Swipe Input System for Touch Devices
            this.canvas.addEventListener('touchstart', (e) => {
                if (this.overlay.classList.contains('hidden') === false) return;
                this.touchStartX = e.touches[0].clientX;
                this.touchStartY = e.touches[0].clientY;
            }, { passive: true });

            this.canvas.addEventListener('touchmove', (e) => {
                // Blocks vertical browser bounce scrolls ONLY inside the running canvas frame
                if (this.overlay.classList.contains('hidden') && e.cancelable) {
                    e.preventDefault();
                }
            }, { passive: false });

            this.canvas.addEventListener('touchend', (e) => {
                if (this.overlay.classList.contains('hidden') === false) return;
                
                const diffX = e.changedTouches[0].clientX - this.touchStartX;
                const diffY = e.changedTouches[0].clientY - this.touchStartY;
                const threshold = 35; // Min distance requirement for a swipe registration

                if (Math.max(Math.abs(diffX), Math.abs(diffY)) < threshold) return;

                if (Math.abs(diffX) > Math.abs(diffY)) {
                    if (diffX > 0) this.redirect('RIGHT');
                    else this.redirect('LEFT');
                } else {
                    if (diffY > 0) this.redirect('DOWN');
                    else this.redirect('UP');
                }
            }, { passive: true });

            this.binded = true;
        }
        this.clearCanvas();
        this.overlay.classList.remove('hidden');
    },

    launch() {
        this.overlay.classList.add('hidden');
        this.trail = [{ x: 150, y: 150 }, { x: 135, y: 150 }, { x: 120, y: 150 }];
        this.dx = 15; this.dy = 0; this.points = 0; this.boardScore.textContent = "0";
        this.dropApple();
        
        if (this.pulse) clearInterval(this.pulse);
        this.pulse = setInterval(() => this.renderTick(), 100);
    },

    dropApple() {
        this.apple = {
            x: Math.floor(Math.random() * (this.canvas.width / this.size)) * this.size,
            y: Math.floor(Math.random() * (this.canvas.height / this.size)) * this.size
        };
    },

    interceptKeys(e) {
        if (arcadeApp.activeGame !== 'game-snake' || this.overlay.classList.contains('hidden') === false) return;
        if (['ArrowUp', 'KeyW'].includes(e.code)) { e.preventDefault(); this.redirect('UP'); }
        if (['ArrowDown', 'KeyS'].includes(e.code)) { e.preventDefault(); this.redirect('DOWN'); }
        if (['ArrowLeft', 'KeyA'].includes(e.code)) { e.preventDefault(); this.redirect('LEFT'); }
        if (['ArrowRight', 'KeyD'].includes(e.code)) { e.preventDefault(); this.redirect('RIGHT'); }
    },

    redirect(heading) {
        if (heading === 'UP' && this.dy !== 15) { this.dx = 0; this.dy = -15; }
        if (heading === 'DOWN' && this.dy !== -15) { this.dx = 0; this.dy = 15; }
        if (heading === 'LEFT' && this.dx !== 15) { this.dx = -15; this.dy = 0; }
        if (heading === 'RIGHT' && this.dx !== -15) { this.dx = 15; this.dy = 0; }
    },

    renderTick() {
        const head = { x: this.trail[0].x + this.dx, y: this.trail[0].y + this.dy };

        if (head.x < 0 || head.x >= this.canvas.width || head.y < 0 || head.y >= this.canvas.height || this.trail.some(t => t.x === head.x && t.y === head.y)) {
            this.teardown(); return;
        }

        this.trail.unshift(head);
        if (head.x === this.apple.x && head.y === this.apple.y) {
            this.points += 10; this.boardScore.textContent = this.points; this.dropApple();
        } else {
            this.trail.pop();
        }

        this.clearCanvas();
        this.ctx.fillStyle = '#ef4444'; this.ctx.fillRect(this.apple.x, this.apple.y, this.size - 1, this.size - 1);
        this.ctx.fillStyle = '#22c55e'; this.trail.forEach(t => this.ctx.fillRect(t.x, t.y, this.size - 1, this.size - 1));
    },

    clearCanvas() {
        this.ctx.fillStyle = arcadeApp.canvasBg || '#050507'; this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    },

    teardown() {
        if (this.pulse) clearInterval(this.pulse);
        if (this.overlay) this.overlay.classList.remove('hidden');
    }
};

// --- GAME 5: HIGH-LOW ---
const highLowGame = {
    target: 0, left: 7, binded: false,

    start() {
        if (!this.binded) {
            this.form = document.getElementById('hl-form');
            this.input = document.getElementById('hl-input');
            this.submitBtn = document.getElementById('hl-submit');
            this.resetBtn = document.getElementById('hl-reset');
            this.leftEl = document.getElementById('hl-attempts');
            this.feedback = document.getElementById('hl-feedback');
            this.historyLog = document.getElementById('hl-log');

            this.form.addEventListener('submit', (e) => { e.preventDefault(); this.process(); });
            this.resetBtn.addEventListener('click', () => this.start());
            this.binded = true;
        }
        this.target = Math.floor(Math.random() * 100) + 1;
        this.left = 7; this.leftEl.textContent = this.left;
        this.historyLog.innerHTML = ""; this.input.value = "";
        this.input.disabled = false; this.submitBtn.disabled = false;
        this.resetBtn.classList.add('hidden');
        this.feedback.className = "feedback-box"; this.feedback.textContent = "Guess a number between 1 and 100";
    },

    process() {
        const val = parseInt(this.input.value);
        if (isNaN(val) || val < 1 || val > 100) return;
        this.input.value = ""; this.left--; this.leftEl.textContent = this.left;

        const row = document.createElement('div'); row.className = "log-item";

        if (val === this.target) {
            row.className += " log-correct"; row.innerHTML = `<span>Guess: ${val}</span><span>🎉 Correct!</span>`;
            this.historyLog.prepend(row); this.stop(true);
        } else if (this.left === 0) {
            row.className += " log-high"; row.innerHTML = `<span>Guess: ${val}</span><span>Game Over</span>`;
            this.historyLog.prepend(row); this.stop(false);
        } else {
            const isHigh = val > this.target;
            row.className += isHigh ? " log-high" : " log-low";
            row.innerHTML = `<span>Guess: ${val}</span><span>${isHigh ? 'Too High ⬇️' : 'Too Low ⬆️'}</span>`;
            this.feedback.textContent = isHigh ? "Too High!" : "Too Low!";
            this.historyLog.prepend(row);
        }
    },

    stop(victory) {
        this.input.disabled = true; this.submitBtn.disabled = true;
        this.resetBtn.classList.remove('hidden');
        this.feedback.className = `feedback-box ${victory ? 'correct' : 'wrong'}`;
        this.feedback.textContent = victory ? `Correct! The number was ${this.target}.` : `Out of tries! The number was ${this.target}.`;
    }
};

// --- GAME 6: FLAPPY PIXEL ---
const flappyGame = {
    ctx: null, pulse: null, bird: { y: 150, velocity: 0 }, pipes: [], points: 0, binded: false,
    gravity: 0.35, jumpForce: -5.5, pipeWidth: 40, pipeGap: 95, pipeSpeed: 2.5,

    start() {
        if (!this.binded) {
            this.canvas = document.getElementById('flappy-canvas');
            this.ctx = this.canvas.getContext('2d');
            this.boardScore = document.getElementById('flappy-score');
            this.overlay = document.getElementById('flappy-overlay');

            document.getElementById('flappy-start').addEventListener('click', () => this.launch());
            
            const handleAction = (e) => {
                if (arcadeApp.activeGame !== 'game-flappy' || this.overlay.classList.contains('hidden') === false) return;
                if (e.cancelable) e.preventDefault();
                this.flap();
            };

            this.canvas.addEventListener('touchstart', handleAction, { passive: false });
            this.canvas.addEventListener('mousedown', handleAction);
            document.addEventListener('keydown', (e) => {
                if (arcadeApp.activeGame !== 'game-flappy' || this.overlay.classList.contains('hidden') === false) return;
                if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) {
                    e.preventDefault();
                    this.flap();
                }
            });

            this.binded = true;
        }
        this.clearCanvas();
        this.overlay.classList.remove('hidden');
    },

    launch() {
        this.overlay.classList.add('hidden');
        this.bird = { y: 120, velocity: 0 };
        this.pipes = [];
        this.points = 0;
        this.boardScore.textContent = "0";
        this.spawnPipe(300);
        this.spawnPipe(460);

        if (this.pulse) clearInterval(this.pulse);
        this.pulse = setInterval(() => this.renderTick(), 20);
    },

    flap() {
        this.bird.velocity = this.jumpForce;
    },

    spawnPipe(startX) {
        const minH = 40;
        const maxH = 300 - this.pipeGap - minH;
        const topHeight = Math.floor(Math.random() * (maxH - minH + 1)) + minH;
        this.pipes.push({ x: startX, top: topHeight, passed: false });
    },

    renderTick() {
        this.bird.velocity += this.gravity;
        this.bird.y += this.bird.velocity;

        if (this.bird.y - 8 < 0 || this.bird.y + 8 > this.canvas.height) {
            this.teardown(); return;
        }

        this.pipes.forEach(p => p.x -= this.pipeSpeed);

        if (this.pipes.length > 0 && this.pipes[this.pipes.length - 1].x < this.canvas.width - 160) {
            this.spawnPipe(this.canvas.width);
        }

        if (this.pipes.length > 0 && this.pipes[0].x < -this.pipeWidth) {
            this.pipes.shift();
        }

        const bX = 60;
        const bY = this.bird.y;
        const bRadius = 8;

        for (let i = 0; i < this.pipes.length; i++) {
            const p = this.pipes[i];
            if (bX + bRadius > p.x && bX - bRadius < p.x + this.pipeWidth) {
                if (bY - bRadius < p.top || bY + bRadius > p.top + this.pipeGap) {
                    this.teardown(); return;
                }
            }
            if (!p.passed && p.x + this.pipeWidth < bX) {
                p.passed = true;
                this.points++;
                this.boardScore.textContent = this.points;
            }
        }

        this.clearCanvas();

        // Draw obstacle pipes
        this.ctx.fillStyle = '#3b82f6';
        this.pipes.forEach(p => {
            this.ctx.fillRect(p.x, 0, this.pipeWidth, p.top);
            this.ctx.fillRect(p.x, p.top + this.pipeGap, this.pipeWidth, this.canvas.height - (p.top + this.pipeGap));
        });

        // Draw bird 
        this.ctx.fillStyle = '#f59e0b';
        this.ctx.beginPath();
        this.ctx.arc(bX, bY, bRadius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Face detail expressions
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(bX + 2, bY - 4, 3, 3);
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(bX + 4, bY - 4, 1, 1);
        this.ctx.fillStyle = '#ef4444';
        this.ctx.fillRect(bX + 5, bY, 4, 3);
    },

    clearCanvas() {
        this.ctx.fillStyle = arcadeApp.canvasBg || '#050507';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    },

    teardown() {
        if (this.pulse) clearInterval(this.pulse);
        if (this.overlay) this.overlay.classList.remove('hidden');
    }
};

// Lifecycle Bootstrapper
document.addEventListener('DOMContentLoaded', () => arcadeApp.init());