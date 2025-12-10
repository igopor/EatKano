// 游戏模式常量
const MODE_NORMAL = 1, MODE_ENDLESS = 2, MODE_PRACTICE = 3;

(function(w) {
    // 全局变量定义
    let body, blockSize, GameLayer = [],
        GameLayerBG, touchArea = [],
        GameTimeLayer;
    let transform, transitionDuration, welcomeLayerClosed;
    let mode = MODE_NORMAL;
    let soundMode = 'on';
    let I18N = {}; // 存储国际化文本
    
    // 游戏状态变量
    let _gameBBList = [],
        _gameBBListIndex = 0,
        _gameOver = false,
        _gameStart = false,
        _gameSettingNum = 20,
        _gameTime, _gameTimeNum, _gameScore, _date1, deviationTime;
    let _gameStartTime, _gameStartDatetime;
    
    // 按键映射
    let map = {'d': 1, 'f': 2, 'j': 3, 'k': 4};

    // 使用fetch获取i18n文件，不依赖jQuery
    function getJsonI18N() {
        const LANGUAGES = [
            { regex: /^zh\b/, lang: 'zh' },
            { regex: /^ja\b/, lang: 'ja' },
            { regex: /.*/, lang: 'en'}
        ];

        const lang = LANGUAGES.find(l => l.regex.test(navigator.language)).lang;
        
        // 使用fetch替代jQuery.ajax
        return fetch(`./static/i18n/${lang}.json`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('找不到语言文件: ' + lang);
                }
                return response.json();
            })
            .catch(error => {
                console.error(error);
                // 加载默认语言
                return fetch('./static/i18n/en.json')
                    .then(response => response.json());
            });
    }

    // 应用国际化文本到页面
    function applyI18N() {
        // 更新文本内容
        document.querySelectorAll('[data-i18n]').forEach(function(el) {
            const content = I18N[el.dataset.i18n];
            if (content) {
                el.textContent = content;
            }
        });
        
        // 更新placeholder
        document.querySelectorAll('[data-placeholder-i18n]').forEach(function(el) {
            const placeholder = I18N[el.dataset.placeholderI18n];
            if (placeholder) {
                el.placeholder = placeholder;
            }
        });
        
        // 设置html语言属性
        if (I18N['lang']) {
            document.documentElement.lang = I18N['lang'];
        }
    }

    // 简单版cookie操作函数
    function cookie(name, value, days) {
        if (arguments.length === 1) {
            // 读取cookie
            const nameEQ = name + "=";
            const ca = document.cookie.split(';');
            for(let i=0; i < ca.length; i++) {
                let c = ca[i];
                while (c.charAt(0) === ' ') c = c.substring(1, c.length);
                if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
            }
            return null;
        } else if (value === null || value === undefined) {
            // 删除cookie
            document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        } else {
            // 设置cookie
            let expires = '';
            if (days) {
                const date = new Date();
                date.setTime(date.getTime() + (days*24*60*60*1000));
                expires = '; expires=' + date.toUTCString();
            }
            document.cookie = name + '=' + encodeURIComponent(value) + expires + '; path=/';
        }
    }

    // 检测是否为桌面设备
    function isDesktop() {
        return !navigator.userAgent.match(/(ipad|iphone|ipod|android|windows phone)/i);
    }

    // 初始化设备适配样式
    function initDeviceStyle() {
        const isDesktopDevice = isDesktop();
        const fontunit = isDesktopDevice ? 20 : ((window.innerWidth > window.innerHeight ? window.innerHeight : window.innerWidth) / 320) * 10;
        const fontSize = fontunit < 30 ? fontunit : 30;
        
        // 动态添加样式
        const style = document.createElement('style');
        style.textContent = `
            html,body {font-size: ${fontSize}px;}
            ${isDesktopDevice ? 
                '#welcome,#GameTimeLayer,#GameLayerBG,#GameScoreLayer.SHADE{position: absolute;}' : 
                '#welcome,#GameTimeLayer,#GameLayerBG,#GameScoreLayer.SHADE{position:fixed;}'
            }
        `;
        document.head.appendChild(style);
        
        // 如果是桌面设备，添加键盘事件监听
        if (isDesktopDevice) {
            document.onkeydown = function (e) {
                let key = e.key.toLowerCase();
                if (Object.keys(map).indexOf(key) !== -1) {
                    click(map[key]);
                }
            };
        }
    }

    // 主初始化函数
    w.init = function() {
        // 首先确保游戏图层存在
        if (!document.getElementById('GameLayer1')) {
            document.body.insertAdjacentHTML('beforeend', createGameLayer());
        }
        
        // 获取DOM元素
        body = document.getElementById('gameBody') || document.body;
        body.style.height = window.innerHeight + 'px';
        
        // 检测浏览器支持的transform属性
        transform = typeof (body.style.webkitTransform) !== 'undefined' ? 'webkitTransform' : 
                    (typeof (body.style.msTransform) !== 'undefined' ? 'msTransform' : 'transform');
        transitionDuration = transform.replace(/ransform/g, 'ransitionDuration');
        
        // 获取游戏图层元素
        GameTimeLayer = document.getElementById('GameTimeLayer');
        GameLayer.push(document.getElementById('GameLayer1'));
        GameLayer[0].children = GameLayer[0].querySelectorAll('div');
        GameLayer.push(document.getElementById('GameLayer2'));
        GameLayer[1].children = GameLayer[1].querySelectorAll('div');
        GameLayerBG = document.getElementById('GameLayerBG');
        
        // 设置触摸/点击事件
        if (GameLayerBG.ontouchstart === null) {
            GameLayerBG.ontouchstart = gameTapEvent;
        } else {
            GameLayerBG.onmousedown = gameTapEvent;
        }
        
        // 游戏初始化
        gameInit();
        initSetting();
        
        // 显示欢迎界面
        showWelcomeLayer();
        
        // 添加窗口大小调整监听
        window.addEventListener('resize', refreshSize, false);
        
        console.log('游戏初始化完成');
    };

    // 获取游戏模式
    function getMode() {
        const savedMode = cookie('gameMode');
        return savedMode ? parseInt(savedMode) : MODE_NORMAL;
    }

    // 获取声音模式
    function getSoundMode() {
        const savedSoundMode = cookie('soundMode');
        return savedSoundMode || 'on';
    }

    // 切换声音模式
    w.changeSoundMode = function() {
        soundMode = soundMode === 'on' ? 'off' : 'on';
        cookie('soundMode', soundMode, 100);
        updateSoundButtonText();
    };

    // 更新声音按钮文本
    function updateSoundButtonText() {
        const soundButton = document.getElementById('sound');
        if (soundButton) {
            soundButton.textContent = soundMode === 'on' ? I18N['sound-on'] : I18N['sound-off'];
        }
    }

    // 游戏模式转字符串
    function modeToString(m) {
        if (m === MODE_NORMAL) return I18N['normal'];
        if (m === MODE_ENDLESS) return I18N['endless'];
        return I18N['practice'];
    }

    // 切换游戏模式
    w.changeMode = function(m) {
        mode = m;
        cookie('gameMode', m, 100);
        document.getElementById('mode').textContent = modeToString(m);
    };

    // 准备按钮点击事件
    w.readyBtn = function() {
        closeWelcomeLayer();
        updatePanel();
    };

    // 窗口大小调整处理
    let refreshSizeTime;
    function refreshSize() {
        clearTimeout(refreshSizeTime);
        refreshSizeTime = setTimeout(_refreshSize, 200);
    }

    function _refreshSize() {
        countBlockSize();
        for (let i = 0; i < GameLayer.length; i++) {
            let box = GameLayer[i];
            for (let j = 0; j < box.children.length; j++) {
                let r = box.children[j];
                r.style.left = (j % 4) * blockSize + 'px';
                r.style.bottom = Math.floor(j / 4) * blockSize + 'px';
                r.style.width = blockSize + 'px';
                r.style.height = blockSize + 'px';
            }
        }
        
        let f, a;
        if (GameLayer[0].y > GameLayer[1].y) {
            f = GameLayer[0];
            a = GameLayer[1];
        } else {
            f = GameLayer[1];
            a = GameLayer[0];
        }
        
        let y = ((_gameBBListIndex) % 10) * blockSize;
        f.y = y;
        f.style[transform] = 'translate3D(0,' + f.y + 'px,0)';
        a.y = -blockSize * Math.floor(f.children.length / 4) + y;
        a.style[transform] = 'translate3D(0,' + a.y + 'px,0)';
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
        // 注册音效
        if (typeof createjs !== 'undefined' && createjs.Sound) {
            createjs.Sound.registerSound({
                src: "./static/music/err.mp3",
                id: "err"
            });
            createjs.Sound.registerSound({
                src: "./static/music/end.mp3",
                id: "end"
            });
            createjs.Sound.registerSound({
                src: "./static/music/tap.mp3",
                id: "tap"
            });
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
        refreshGameLayer(GameLayer[0]);
        refreshGameLayer(GameLayer[1], 1);
        updatePanel();
    }

    // 游戏开始
    function gameStart() {
        _date1 = new Date();
        _gameStartDatetime = _date1.getTime();
        _gameStart = true;

        _gameTime = setInterval(timer, 1000);
    }

    // 计算CPS（每秒点击次数）
    function getCPS() {
        if (!_gameStartDatetime) return 0;
        let cps = _gameScore / ((new Date().getTime() - _gameStartDatetime) / 1000);
        if (isNaN(cps) || cps === Infinity || _gameStartTime < 2) {
            cps = 0;
        }
        return cps;
    }

    // 计时器
    function timer() {
        _gameTimeNum--;
        _gameStartTime++;
        if (mode === MODE_NORMAL && _gameTimeNum <= 0) {
            GameTimeLayer.innerHTML = I18N['time-up'] + '!';
            gameOver();
            GameLayerBG.className += ' flash';
            if (soundMode === 'on' && typeof createjs !== 'undefined') {
                createjs.Sound.play("end");
            }
        }
        updatePanel();
    }

    // 更新游戏面板显示
    function updatePanel() {
        if (!GameTimeLayer) return;
        
        if (mode === MODE_NORMAL) {
            if (!_gameOver) {
                GameTimeLayer.innerHTML = createTimeText(_gameTimeNum);
            }
        } else if (mode === MODE_ENDLESS) {
            let cps = getCPS();
            let text = (cps === 0 ? I18N['calculating'] : cps.toFixed(2));
            GameTimeLayer.innerHTML = `CPS:${text}`;
        } else {
            GameTimeLayer.innerHTML = `SCORE:${_gameScore}`;
        }
    }

    // 游戏结束
    function gameOver() {
        _gameOver = true;
        clearInterval(_gameTime);
        let cps = getCPS();
        updatePanel();
        
        setTimeout(function () {
            if (GameLayerBG) {
                GameLayerBG.className = '';
            }
            showGameScoreLayer(cps);
            focusOnReplay();
        }, 1500);
    }

    // 使重试按钮获得焦点
    function focusOnReplay() {
        const replayBtn = document.getElementById('replay');
        if (replayBtn) {
            replayBtn.focus();
        }
    }

    // 创建时间文本
    function createTimeText(n) {
        return 'TIME:' + Math.ceil(n);
    }

    // 刷新游戏图层
    let _ttreg = / t{1,2}(\d+)/,
        _clearttClsReg = / t{1,2}\d+| bad/;

    function refreshGameLayer(box, loop, offset) {
        if (!box || !box.children) return;
        
        let i = Math.floor(Math.random() * 1000) % 4 + (loop ? 0 : 4);
        for (let j = 0; j < box.children.length; j++) {
            let r = box.children[j];
            r.style.left = (j % 4) * blockSize + 'px';
            r.style.bottom = Math.floor(j / 4) * blockSize + 'px';
            r.style.width = blockSize + 'px';
            r.style.height = blockSize + 'px';
            r.className = r.className.replace(_clearttClsReg, '');
            
            if (i === j) {
                _gameBBList.push({
                    cell: i % 4,
                    id: r.id
                });
                r.className += ' t' + (Math.floor(Math.random() * 1000) % 5 + 1);
                r.notEmpty = true;
                i = (Math.floor(j / 4) + 1) * 4 + Math.floor(Math.random() * 1000) % 4;
            } else {
                r.notEmpty = false;
            }
        }
        
        if (loop) {
            box.style.webkitTransitionDuration = '0ms';
            box.style.display = 'none';
            box.y = -blockSize * (Math.floor(box.children.length / 4) + (offset || 0)) * loop;
            setTimeout(function () {
                box.style[transform] = 'translate3D(0,' + box.y + 'px,0)';
                setTimeout(function () {
                    box.style.display = 'block';
                }, 100);
            }, 200);
        } else {
            box.y = 0;
            box.style[transform] = 'translate3D(0,' + box.y + 'px,0)';
        }
        box.style[transitionDuration] = '150ms';
    }

    // 游戏图层移动下一行
    function gameLayerMoveNextRow() {
        for (let i = 0; i < GameLayer.length; i++) {
            let g = GameLayer[i];
            g.y += blockSize;
            if (g.y > blockSize * (Math.floor(g.children.length / 4))) {
                refreshGameLayer(g, 1, -1);
            } else {
                g.style[transform] = 'translate3D(0,' + g.y + 'px,0)';
            }
        }
    }

    // 游戏点击/触摸事件处理
    function gameTapEvent(e) {
        if (_gameOver || !e) {
            return false;
        }
        
        let tar = e.target;
        let y = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
        let x = (e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0)) - (body.offsetLeft || 0);
        let p = _gameBBList[_gameBBListIndex];
        
        if (!p || y > touchArea[0] || y < touchArea[1]) {
            return false;
        }
        
        if ((p.id === tar.id && tar.notEmpty) || 
            (p.cell === 0 && x < blockSize) || 
            (p.cell === 1 && x > blockSize && x < 2 * blockSize) || 
            (p.cell === 2 && x > 2 * blockSize && x < 3 * blockSize) || 
            (p.cell === 3 && x > 3 * blockSize)) {
            
            if (!_gameStart) {
                gameStart();
            }
            
            if (soundMode === 'on' && typeof createjs !== 'undefined') {
                createjs.Sound.play("tap");
            }
            
            tar = document.getElementById(p.id);
            tar.className = tar.className.replace(_ttreg, ' tt$1');
            _gameBBListIndex++;
            _gameScore++;
            updatePanel();
            gameLayerMoveNextRow();
            
        } else if (_gameStart && tar && !tar.notEmpty) {
            if (soundMode === 'on' && typeof createjs !== 'undefined') {
                createjs.Sound.play("err");
            }
            
            tar.classList.add('bad');
            
            if (mode === MODE_PRACTICE) {
                setTimeout(() => {
                    tar.classList.remove('bad');
                }, 500);
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
            let id = 'GameLayer' + i;
            html += '<div id="' + id + '" class="GameLayer">';
            for (let j = 0; j < 10; j++) {
                for (let k = 0; k < 4; k++) {
                    html += '<div id="' + id + '-' + (k + j * 4) + '" num="' + (k + j * 4) + '" class="block' + (k ? ' bl' : '') + '"></div>';
                }
            }
            html += '</div>';
        }
        html += '</div>';
        html += '<div id="GameTimeLayer" class="text-center"></div>';
        return html;
    }

    // 关闭欢迎界面
    function closeWelcomeLayer() {
        welcomeLayerClosed = true;
        const welcomeEl = document.getElementById('welcome');
        if (welcomeEl) {
            welcomeEl.style.display = 'none';
        }
        updatePanel();
    }

    // 显示欢迎界面
    function showWelcomeLayer() {
        welcomeLayerClosed = false;
        const welcomeEl = document.getElementById('welcome');
        if (welcomeEl) {
            welcomeEl.style.display = 'block';
        }
        
        // 更新模式显示
        const modeEl = document.getElementById('mode');
        if (modeEl) {
            modeEl.textContent = modeToString(mode);
        }
    }

    // 获取最佳分数
    function getBestScore(score) {
        let cookieName = (mode === MODE_NORMAL ? 'bast-score' : 'endless-best-score');
        let best = cookie(cookieName) ? Math.max(parseFloat(cookie(cookieName)), score) : score;
        cookie(cookieName, best.toFixed(2), 100);
        return best;
    }

    // 分数转字符串
    function scoreToString(score) {
        return mode === MODE_ENDLESS ? score.toFixed(2) : score.toString();
    }

    // 显示游戏分数界面
    function showGameScoreLayer(cps) {
        const scoreLayer = document.getElementById('GameScoreLayer');
        if (!scoreLayer) return;
        
        let c = 1;
        const lastBlock = document.getElementById(_gameBBList[_gameBBListIndex - 1]?.id);
        if (lastBlock) {
            const match = lastBlock.className.match(_ttreg);
            c = match ? match[1] : 1;
        }
        
        let score = (mode === MODE_ENDLESS ? cps : _gameScore);
        let best = getBestScore(score);
        
        // 更新背景颜色类
        scoreLayer.className = scoreLayer.className.replace(/bgc\d/, 'bgc' + c);
        
        // 更新文本内容
        const textEl = document.getElementById('GameScoreLayer-text');
        if (textEl) {
            textEl.innerHTML = shareText(cps);
        }
        
        // 更新分数显示
        const cpsEl = document.getElementById('cps');
        if (cpsEl) {
            cpsEl.textContent = cps.toFixed(2);
        }
        
        const scoreEl = document.getElementById('score');
        if (scoreEl) {
            scoreEl.textContent = scoreToString(score);
        }
        
        const bestEl = document.getElementById('best');
        if (bestEl) {
            bestEl.textContent = scoreToString(best);
        }
        
        // 显示分数面板
        scoreLayer.style.display = 'block';
    }

    // 隐藏游戏分数界面
    function hideGameScoreLayer() {
        const scoreLayer = document.getElementById('GameScoreLayer');
        if (scoreLayer) {
            scoreLayer.style.display = 'none';
        }
    }

    // 重玩按钮
    w.replayBtn = function() {
        gameRestart();
        hideGameScoreLayer();
    };

    // 分享文本生成
    function shareText(cps) {
        if (mode === MODE_NORMAL) {
            let date2 = new Date();
            deviationTime = (date2.getTime() - _date1.getTime());
            if (deviationTime > (_gameSettingNum + 3) * 1000) {
                return I18N['time-over'] + ((deviationTime / 1000) - _gameSettingNum).toFixed(2) + 's';
            }
        }

        if (cps <= 5) return I18N['text-level-1'];
        if (cps <= 8) return I18N['text-level-2'];
        if (cps <= 10) return I18N['text-level-3'];
        if (cps <= 15) return I18N['text-level-4'];
        return I18N['text-level-5'];
    }

    // 初始化设置
    function initSetting() {
        // 从cookie加载设置
        const title = cookie('title');
        if (title) {
            document.title = title;
            const titleInput = document.getElementById('title');
            if (titleInput) {
                titleInput.value = title;
            }
        }
        
        const keyboard = cookie('keyboard');
        if (keyboard) {
            const keyboardLower = keyboard.toString().toLowerCase();
            const keyboardInput = document.getElementById('keyboard');
            if (keyboardInput) {
                keyboardInput.value = keyboardLower;
            }
            
            // 更新按键映射
            map = {};
            map[keyboardLower.charAt(0)] = 1;
            map[keyboardLower.charAt(1)] = 2;
            map[keyboardLower.charAt(2)] = 3;
            map[keyboardLower.charAt(3)] = 4;
        }
        
        const gameTime = cookie('gameTime');
        if (gameTime) {
            const gameTimeInput = document.getElementById('gameTime');
            if (gameTimeInput) {
                gameTimeInput.value = gameTime;
            }
            _gameSettingNum = parseInt(gameTime) || 20;
            gameRestart();
        }
        
        // 初始化声音模式
        soundMode = getSoundMode();
        updateSoundButtonText();
        
        // 初始化游戏模式
        mode = getMode();
    }

    // 显示设置界面
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

    // 保存设置到cookie
    w.save_cookie = function() {
        const settings = ['title', 'keyboard', 'gameTime'];
        settings.forEach(function(setting) {
            const element = document.getElementById(setting);
            if (element && element.value) {
                cookie(setting, element.value.toString(), 100);
            }
        });
        
        initSetting();
    };

    // 模拟点击事件
    w.click = function(index) {
        if (!welcomeLayerClosed) {
            return;
        }

        let p = _gameBBList[_gameBBListIndex];
        if (!p) return;
        
        let base = parseInt(document.getElementById(p.id).getAttribute("num")) - p.cell;
        let num = base + index - 1;
        let id = p.id.substring(0, 11) + num;

        let fakeEvent = {
            clientX: ((index - 1) * blockSize + index * blockSize) / 2 + (body.offsetLeft || 0),
            clientY: (touchArea[0] + touchArea[1]) / 2,
            target: document.getElementById(id),
        };

        gameTapEvent(fakeEvent);
    };

    // 页面加载完成后执行初始化
    document.addEventListener('DOMContentLoaded', function() {
        // 初始化设备样式
        initDeviceStyle();
        
        // 加载国际化文本
        getJsonI18N().then(function(data) {
            I18N = data;
            // 应用国际化
            applyI18N();
            
            // 初始化游戏
            mode = getMode();
            soundMode = getSoundMode();
            
            // 游戏图层会在init中创建
            w.init();
        }).catch(function(error) {
            console.error('国际化加载失败:', error);
            // 即使失败也尝试初始化游戏
            w.init();
        });
    });

})(window);
