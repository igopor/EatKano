// 游戏模式常量
const MODE_NORMAL = 1, MODE_ENDLESS = 2, MODE_PRACTICE = 3;

(function(w) {
    // 全局变量
    let body, blockSize, GameLayer = [],
        GameLayerBG, touchArea = [],
        GameTimeLayer;
    let transform, transitionDuration, welcomeLayerClosed;
    let mode = MODE_NORMAL;
    let soundMode = 'on';
    let I18N = {};
    
    // 游戏状态
    let _gameBBList = [],
        _gameBBListIndex = 0,
        _gameOver = false,
        _gameStart = false,
        _gameSettingNum = 20,
        _gameTime, _gameTimeNum, _gameScore, _date1, deviationTime;
    let _gameStartTime, _gameStartDatetime;
    
    // 按键映射
    let map = {'d': 1, 'f': 2, 'j': 3, 'k': 4};

    // 获取国际化文本
    function getJsonI18N() {
        const LANGUAGES = [
            { regex: /^zh\b/, lang: 'zh' },
            { regex: /^ja\b/, lang: 'ja' },
            { regex: /.*/, lang: 'en' }
        ];

        const lang = LANGUAGES.find(l => l.regex.test(navigator.language)).lang;
        
        return fetch(`./static/i18n/${lang}.json`)
            .then(response => {
                if (!response.ok) throw new Error(`找不到语言文件: ${lang}`);
                return response.json();
            })
            .catch(error => {
                console.error('语言文件加载失败:', error);
                return fetch('./static/i18n/en.json')
                    .then(response => response.json())
                    .catch(err => {
                        console.error('备用语言文件也加载失败:', err);
                        return {};
                    });
            });
    }

    // 应用国际化
    function applyI18N() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (I18N[key]) {
                el.textContent = I18N[key];
            }
        });
        
        document.querySelectorAll('[data-placeholder-i18n]').forEach(el => {
            const key = el.getAttribute('data-placeholder-i18n');
            if (I18N[key]) {
                el.setAttribute('placeholder', I18N[key]);
            }
        });
        
        if (I18N['lang']) {
            document.documentElement.lang = I18N['lang'];
        }
    }

    // Cookie操作
    function cookie(name, value, days) {
        if (arguments.length === 1) {
            const nameEQ = name + "=";
            const ca = document.cookie.split(';');
            for(let i = 0; i < ca.length; i++) {
                let c = ca[i].trim();
                if (c.indexOf(nameEQ) === 0) {
                    return decodeURIComponent(c.substring(nameEQ.length));
                }
            }
            return null;
        } else if (value === null || value === undefined) {
            document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        } else {
            let expires = '';
            if (days) {
                const date = new Date();
                date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
                expires = '; expires=' + date.toUTCString();
            }
            document.cookie = name + '=' + encodeURIComponent(value) + expires + '; path=/';
        }
    }

    // 设备检测
    function isDesktop() {
        return !navigator.userAgent.match(/(ipad|iphone|ipod|android|windows phone)/i);
    }

    // 初始化设备样式
    function initDeviceStyle() {
        const desktop = isDesktop();
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const fontunit = desktop ? 20 : ((screenWidth > screenHeight ? screenHeight : screenWidth) / 320) * 10;
        const fontSize = Math.min(fontunit, 30);
        
        document.documentElement.style.fontSize = fontSize + 'px';
        
        if (desktop) {
            document.addEventListener('keydown', function(e) {
                const key = e.key.toLowerCase();
                if (map[key] && typeof w.click === 'function') {
                    w.click(map[key]);
                }
            });
        }
    }

    // 主初始化函数
    w.init = function() {
        console.log('初始化游戏开始...');
        
        initDeviceStyle();
        
        // 确保游戏图层存在
        if (!document.getElementById('GameLayer1')) {
            document.body.insertAdjacentHTML('beforeend', createGameLayer());
        }
        
        body = document.getElementById('gameBody') || document.body;
        body.style.height = window.innerHeight + 'px';
        
        // 检测支持的transform属性
        const testDiv = document.createElement('div');
        if (typeof testDiv.style.webkitTransform !== 'undefined') {
            transform = 'webkitTransform';
        } else if (typeof testDiv.style.msTransform !== 'undefined') {
            transform = 'msTransform';
        } else {
            transform = 'transform';
        }
        transitionDuration = transform.replace(/ransform/i, 'ransitionDuration');
        
        // 获取游戏元素
        GameTimeLayer = document.getElementById('GameTimeLayer');
        
        // 获取游戏图层
        for (let i = 1; i <= 2; i++) {
            const layer = document.getElementById(`GameLayer${i}`);
            if (layer) {
                layer.children = layer.querySelectorAll('div');
                GameLayer.push(layer);
            }
        }
        
        GameLayerBG = document.getElementById('GameLayerBG');
        
        // 正确绑定事件
        if (GameLayerBG) {
            // 移除之前的事件监听器
            GameLayerBG.removeEventListener('touchstart', gameTapEvent);
            GameLayerBG.removeEventListener('mousedown', gameTapEvent);
            GameLayerBG.removeEventListener('click', gameTapEvent);
            
            // 根据设备类型绑定单个事件
            const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            
            if (isTouchDevice) {
                // 移动设备：只绑定touchstart
                GameLayerBG.addEventListener('touchstart', gameTapEvent, { passive: false });
                console.log('移动设备：绑定touchstart事件');
            } else {
                // 桌面设备：只绑定mousedown
                GameLayerBG.addEventListener('mousedown', gameTapEvent, { passive: false });
                console.log('桌面设备：绑定mousedown事件');
            }
        }
        
        gameInit();
        initSetting();
        showWelcomeLayer();
        
        window.addEventListener('resize', function() {
            setTimeout(refreshSize, 200);
        });
        
        console.log('游戏初始化完成');
    };

    // 获取游戏模式
    function getMode() {
        const saved = cookie('gameMode');
        return saved ? parseInt(saved) : MODE_NORMAL;
    }

    // 获取声音模式
    function getSoundMode() {
        return cookie('soundMode') || 'on';
    }

    // 切换声音模式
    w.changeSoundMode = function() {
        soundMode = soundMode === 'on' ? 'off' : 'on';
        cookie('soundMode', soundMode, 100);
        updateSoundButtonText();
    };

    // 更新声音按钮文本
    function updateSoundButtonText() {
        const btn = document.getElementById('sound');
        if (btn && I18N) {
            btn.textContent = soundMode === 'on' ? I18N['sound-on'] : I18N['sound-off'];
        }
    }

    // 模式转字符串
    function modeToString(m) {
        if (!I18N) return 'NORMAL';
        if (m === MODE_NORMAL) return I18N['normal'] || 'NORMAL';
        if (m === MODE_ENDLESS) return I18N['endless'] || 'ENDLESS';
        return I18N['practice'] || 'PRACTICE';
    }

    // 切换模式
    w.changeMode = function(m) {
        mode = m;
        cookie('gameMode', m, 100);
        const modeBtn = document.getElementById('mode');
        if (modeBtn) {
            modeBtn.textContent = modeToString(m);
        }
    };

    // 准备开始游戏
    w.readyBtn = function() {
        closeWelcomeLayer();
        updatePanel();
    };

    // 刷新游戏大小
    function refreshSize() {
        countBlockSize();
        
        if (!GameLayer.length) return;
        
        for (let i = 0; i < GameLayer.length; i++) {
            const box = GameLayer[i];
            for (let j = 0; j < box.children.length; j++) {
                const r = box.children[j];
                r.style.left = (j % 4) * blockSize + 'px';
                r.style.bottom = Math.floor(j / 4) * blockSize + 'px';
                r.style.width = blockSize + 'px';
                r.style.height = blockSize + 'px';
            }
        }
        
        if (GameLayer.length === 2) {
            const y = ((_gameBBListIndex) % 10) * blockSize;
            const f = GameLayer[0].y > GameLayer[1].y ? GameLayer[0] : GameLayer[1];
            const a = f === GameLayer[0] ? GameLayer[1] : GameLayer[0];
            
            f.y = y;
            f.style[transform] = 'translate3D(0,' + f.y + 'px,0)';
            a.y = -blockSize * Math.floor(f.children.length / 4) + y;
            a.style[transform] = 'translate3D(0,' + a.y + 'px,0)';
        }
    }

    // 计算方块大小
    function countBlockSize() {
        blockSize = body.offsetWidth / 4;
        body.style.height = window.innerHeight + 'px';
        if (GameLayerBG) {
            GameLayerBG.style.height = window.innerHeight + 'px';
        }
        touchArea[0] = window.innerHeight;
        touchArea[1] = window.innerHeight - blockSize * 3;
    }

    // 游戏初始化
    function gameInit() {
        if (typeof createjs !== 'undefined' && createjs.Sound) {
            try {
                createjs.Sound.registerSound({ src: "./static/music/err.mp3", id: "err" });
                createjs.Sound.registerSound({ src: "./static/music/end.mp3", id: "end" });
                createjs.Sound.registerSound({ src: "./static/music/tap.mp3", id: "tap" });
            } catch (e) {
                console.warn('音效注册失败:', e);
            }
        }
        
        gameRestart();
    }

    // 游戏重新开始
    function gameRestart() {
        _gameBBList = [];
        _gameBBListIndex = 0;
        _gameScore = 0;
        _gameOver = false;
        _gameStart = false;
        _gameTimeNum = _gameSettingNum;
        _gameStartTime = 0;
        
        countBlockSize();
        
        if (GameLayer[0]) refreshGameLayer(GameLayer[0]);
        if (GameLayer[1]) refreshGameLayer(GameLayer[1], 1);
        
        updatePanel();
    }

    // 游戏开始
    function gameStart() {
        _date1 = new Date();
        _gameStartDatetime = _date1.getTime();
        _gameStart = true;
        _gameTime = setInterval(timer, 1000);
    }

    // 计算CPS
    function getCPS() {
        if (!_gameStartDatetime) return 0;
        const elapsed = (Date.now() - _gameStartDatetime) / 1000;
        if (elapsed < 0.5) return 0;
        const cps = _gameScore / elapsed;
        return isNaN(cps) || !isFinite(cps) ? 0 : cps;
    }

    // 计时器
    function timer() {
        _gameTimeNum--;
        _gameStartTime++;
        
        if (mode === MODE_NORMAL && _gameTimeNum <= 0) {
            if (GameTimeLayer) {
                GameTimeLayer.innerHTML = (I18N['time-up'] || 'TIME UP') + '!';
            }
            gameOver();
            if (GameLayerBG) {
                GameLayerBG.classList.add('flash');
            }
            if (soundMode === 'on' && typeof createjs !== 'undefined') {
                createjs.Sound.play("end");
            }
        }
        updatePanel();
    }

    // 更新面板
    function updatePanel() {
        if (!GameTimeLayer) return;
        
        if (mode === MODE_NORMAL) {
            if (!_gameOver) {
                GameTimeLayer.innerHTML = 'TIME:' + Math.ceil(_gameTimeNum);
            }
        } else if (mode === MODE_ENDLESS) {
            const cps = getCPS();
            const text = cps === 0 ? (I18N['calculating'] || 'Calculating') : cps.toFixed(2);
            GameTimeLayer.innerHTML = `CPS:${text}`;
        } else {
            GameTimeLayer.innerHTML = `SCORE:${_gameScore}`;
        }
    }

    // 游戏结束
    function gameOver() {
        _gameOver = true;
        clearInterval(_gameTime);
        const cps = getCPS();
        updatePanel();
        
        setTimeout(() => {
            if (GameLayerBG) {
                GameLayerBG.classList.remove('flash');
            }
            showGameScoreLayer(cps);
            focusOnReplay();
        }, 1500);
    }

    // 焦点到重试按钮
    function focusOnReplay() {
        const replayBtn = document.getElementById('replay');
        if (replayBtn) replayBtn.focus();
    }

    // 刷新游戏图层 - 修复版
    const _ttreg = / t{1,2}(\d+)/;
    const _clearttClsReg = / t{1,2}\d+| bad/;
    
    function refreshGameLayer(box, loop, offset) {
        if (!box || !box.children) return;
        
        // 重置所有块
        for (let j = 0; j < box.children.length; j++) {
            const r = box.children[j];
            r.style.left = (j % 4) * blockSize + 'px';
            r.style.bottom = Math.floor(j / 4) * blockSize + 'px';
            r.style.width = blockSize + 'px';
            r.style.height = blockSize + 'px';
            r.className = r.className.replace(_clearttClsReg, '');
            r.notEmpty = false;
        }
        
        if (loop) {
            // 循环层：只在最后一行生成一个目标块
            const lastRowStart = Math.floor(box.children.length / 4 - 1) * 4;
            const targetCell = Math.floor(Math.random() * 1000) % 4;
            const targetIndex = lastRowStart + targetCell;
            
            if (targetIndex < box.children.length) {
                let r = box.children[targetIndex];
                _gameBBList.push({
                    cell: targetCell,
                    id: r.id
                });
                r.className += ' t' + (Math.floor(Math.random() * 1000) % 5 + 1);
                r.notEmpty = true;
            }
            
            box.style.transitionDuration = '0ms';
            box.style.display = 'none';
            box.y = -blockSize * (Math.floor(box.children.length / 4) + (offset || 0)) * loop;
            
            setTimeout(() => {
                box.style[transform] = 'translate3D(0,' + box.y + 'px,0)';
                setTimeout(() => {
                    box.style.display = 'block';
                }, 100);
            }, 200);
        } else {
            // 非循环层：只在第一行生成一个目标块
            const targetCell = Math.floor(Math.random() * 1000) % 4;
            let r = box.children[targetCell];
            _gameBBList.push({
                cell: targetCell,
                id: r.id
            });
            r.className += ' t' + (Math.floor(Math.random() * 1000) % 5 + 1);
            r.notEmpty = true;
            
            box.y = 0;
            box.style[transform] = 'translate3D(0,' + box.y + 'px,0)';
        }
        box.style[transitionDuration] = '150ms';
    }

    // 游戏图层移动 - 只移动一格
    function gameLayerMoveNextRow() {
        for (let i = 0; i < GameLayer.length; i++) {
            const g = GameLayer[i];
            if (!g) continue;
            
            // 只移动一格
            g.y += blockSize;
            
            if (g.y > blockSize * Math.floor(g.children.length / 4)) {
                refreshGameLayer(g, 1, -1);
            } else {
                g.style[transform] = 'translate3D(0,' + g.y + 'px,0)';
            }
        }
    }

    // 游戏点击事件 - 修复版
    function gameTapEvent(e) {
        if (_gameOver || !e) {
            e.preventDefault();
            return false;
        }
        
        // 阻止事件冒泡和默认行为
        e.stopPropagation();
        e.preventDefault();
        
        // 获取触摸/点击位置
        let clientX, clientY;
        if (e.type === 'touchstart' || e.type === 'touchmove' || e.type === 'touchend') {
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else if (e.changedTouches && e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX;
                clientY = e.changedTouches[0].clientY;
            } else {
                return false;
            }
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        
        let tar = e.target;
        let x = clientX - (body.offsetLeft || 0);
        let y = clientY;
        let p = _gameBBList[_gameBBListIndex];
        
        if (!p || y > touchArea[0] || y < touchArea[1]) {
            return false;
        }
        
        const isCorrect = (p.id === tar.id && tar.notEmpty) || 
                         (p.cell === 0 && x < blockSize) || 
                         (p.cell === 1 && x > blockSize && x < 2 * blockSize) || 
                         (p.cell === 2 && x > 2 * blockSize && x < 3 * blockSize) || 
                         (p.cell === 3 && x > 3 * blockSize);
        
        if (isCorrect) {
            if (!_gameStart) {
                gameStart();
            }
            
            if (soundMode === 'on' && typeof createjs !== 'undefined') {
                createjs.Sound.play("tap");
            }
            
            tar = document.getElementById(p.id);
            if (tar) {
                tar.className = tar.className.replace(_ttreg, ' tt$1');
            }
            
            _gameBBListIndex++;
            _gameScore++;
            updatePanel();
            
            // 只移动一格
            gameLayerMoveNextRow();
            
        } else if (_gameStart && tar && !tar.notEmpty) {
            if (soundMode === 'on' && typeof createjs !== 'undefined') {
                createjs.Sound.play("err");
            }
            
            tar.classList.add('bad');
            
            if (mode === MODE_PRACTICE) {
                setTimeout(() => tar.classList.remove('bad'), 500);
            } else {
                gameOver();
            }
        }
        
        return false;
    }

    // 创建游戏图层HTML
    function createGameLayer() {
        let html = '<div id="GameLayerBG">';
        for (let i = 1; i <= 2; i++) {
            const id = 'GameLayer' + i;
            html += `<div id="${id}" class="GameLayer">`;
            for (let j = 0; j < 10; j++) {
                for (let k = 0; k < 4; k++) {
                    const num = k + j * 4;
                    html += `<div id="${id}-${num}" num="${num}" class="block${k ? ' bl' : ''}"></div>`;
                }
            }
            html += '</div>';
        }
        html += '</div><div id="GameTimeLayer" class="text-center"></div>';
        return html;
    }

    // 关闭欢迎界面
    function closeWelcomeLayer() {
        welcomeLayerClosed = true;
        const welcomeEl = document.getElementById('welcome');
        if (welcomeEl) welcomeEl.style.display = 'none';
        updatePanel();
    }

    // 显示欢迎界面
    function showWelcomeLayer() {
        welcomeLayerClosed = false;
        const welcomeEl = document.getElementById('welcome');
        if (welcomeEl) welcomeEl.style.display = 'block';
        
        const modeEl = document.getElementById('mode');
        if (modeEl && I18N) {
            modeEl.textContent = modeToString(mode);
        }
    }

    // 获取最佳分数
    function getBestScore(score) {
        const cookieName = mode === MODE_NORMAL ? 'bast-score' : 'endless-best-score';
        const bestStr = cookie(cookieName);
        const currentBest = bestStr ? parseFloat(bestStr) : 0;
        const newBest = Math.max(currentBest, score);
        cookie(cookieName, newBest.toFixed(2), 100);
        return newBest;
    }

    // 显示游戏分数界面
    function showGameScoreLayer(cps) {
        const scoreLayer = document.getElementById('GameScoreLayer');
        if (!scoreLayer) return;
        
        let bgColor = 1;
        const lastBlock = _gameBBList[_gameBBListIndex - 1];
        if (lastBlock) {
            const blockEl = document.getElementById(lastBlock.id);
            if (blockEl) {
                const match = blockEl.className.match(_ttreg);
                if (match) bgColor = parseInt(match[1]);
            }
        }
        
        scoreLayer.className = scoreLayer.className.replace(/bgc\d/, 'bgc' + bgColor);
        
        const textEl = document.getElementById('GameScoreLayer-text');
        if (textEl) textEl.innerHTML = shareText(cps);
        
        const cpsEl = document.getElementById('cps');
        if (cpsEl) cpsEl.textContent = cps.toFixed(2);
        
        const scoreEl = document.getElementById('score');
        if (scoreEl) {
            const score = mode === MODE_ENDLESS ? cps : _gameScore;
            scoreEl.textContent = mode === MODE_ENDLESS ? score.toFixed(2) : score.toString();
        }
        
        const bestEl = document.getElementById('best');
        if (bestEl) {
            const bestScore = getBestScore(mode === MODE_ENDLESS ? cps : _gameScore);
            bestEl.textContent = mode === MODE_ENDLESS ? bestScore.toFixed(2) : bestScore.toString();
        }
        
        scoreLayer.style.display = 'block';
    }

    // 隐藏分数界面
    function hideGameScoreLayer() {
        const scoreLayer = document.getElementById('GameScoreLayer');
        if (scoreLayer) scoreLayer.style.display = 'none';
    }

    // 重玩
    w.replayBtn = function() {
        gameRestart();
        hideGameScoreLayer();
    };

    // 分享文本
    function shareText(cps) {
        if (!I18N) return 'Good Game!';
        
        if (mode === MODE_NORMAL) {
            deviationTime = Date.now() - _date1.getTime();
            if (deviationTime > (_gameSettingNum + 3) * 1000) {
                return (I18N['time-over'] || 'Time Over') + ((deviationTime / 1000) - _gameSettingNum).toFixed(2) + 's';
            }
        }
        
        if (cps <= 5) return I18N['text-level-1'] || 'Keep practicing!';
        if (cps <= 8) return I18N['text-level-2'] || 'Good job!';
        if (cps <= 10) return I18N['text-level-3'] || 'Excellent!';
        if (cps <= 15) return I18N['text-level-4'] || 'Outstanding!';
        return I18N['text-level-5'] || 'Legendary!';
    }

    // 初始化设置
    function initSetting() {
        const title = cookie('title');
        if (title) {
            document.title = title;
            const titleInput = document.getElementById('title');
            if (titleInput) titleInput.value = title;
        }
        
        const keyboard = cookie('keyboard');
        if (keyboard) {
            const keyboardLower = keyboard.toLowerCase();
            const keyboardInput = document.getElementById('keyboard');
            if (keyboardInput) keyboardInput.value = keyboardLower;
            
            map = {};
            const keys = keyboardLower.split('');
            for (let i = 0; i < Math.min(keys.length, 4); i++) {
                map[keys[i]] = i + 1;
            }
        }
        
        const gameTime = cookie('gameTime');
        if (gameTime) {
            const gameTimeInput = document.getElementById('gameTime');
            if (gameTimeInput) gameTimeInput.value = gameTime;
            _gameSettingNum = parseInt(gameTime) || 20;
        }
        
        soundMode = getSoundMode();
        mode = getMode();
        updateSoundButtonText();
    }

    // 显示设置
    w.show_setting = function() {
        const btnGroup = document.getElementById('btn_group');
        const desc = document.getElementById('desc');
        const setting = document.getElementById('setting');
        
        if (btnGroup) btnGroup.style.display = 'none';
        if (desc) desc.style.display = 'none';
        if (setting) setting.style.display = 'block';
        
        updateSoundButtonText();
    };

    // 显示按钮组
    w.show_btn = function() {
        const btnGroup = document.getElementById('btn_group');
        const desc = document.getElementById('desc');
        const setting = document.getElementById('setting');
        
        if (btnGroup) btnGroup.style.display = 'block';
        if (desc) desc.style.display = 'block';
        if (setting) setting.style.display = 'none';
    };

    // 保存设置
    w.save_cookie = function() {
        const settings = ['title', 'keyboard', 'gameTime'];
        settings.forEach(name => {
            const el = document.getElementById(name);
            if (el && el.value) {
                cookie(name, el.value, 100);
            }
        });
        initSetting();
    };

    // 模拟点击
    w.click = function(index) {
        if (!welcomeLayerClosed || !_gameBBList[_gameBBListIndex]) return;
        
        const p = _gameBBList[_gameBBListIndex];
        const baseEl = document.getElementById(p.id);
        if (!baseEl) return;
        
        const baseNum = parseInt(baseEl.getAttribute('num'));
        const num = baseNum - p.cell + index - 1;
        const id = p.id.substring(0, 11) + num;
        const targetEl = document.getElementById(id);
        
        if (targetEl) {
            const fakeEvent = {
                target: targetEl,
                clientX: ((index - 1) * blockSize + index * blockSize) / 2 + (body.offsetLeft || 0),
                clientY: (touchArea[0] + touchArea[1]) / 2,
                preventDefault: function() {},
                stopPropagation: function() {}
            };
            
            gameTapEvent(fakeEvent);
        }
    };

    // DOM加载完成后初始化
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM加载完成，开始初始化游戏...');
        
        getJsonI18N().then(data => {
            I18N = data;
            applyI18N();
            w.init();
        }).catch(err => {
            console.error('国际化加载失败，使用默认初始化:', err);
            w.init();
        });
    });

})(window);
