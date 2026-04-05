// ==UserScript==
// @name         Forest Shuffle Tracker (森森不息 记牌器)
// @namespace    http://tampermonkey.net/
// @version      test v1
// @description  Card Registry architecture — 100% ID-based tracking with global MutationObserver
// @author       Antigravity
// @match        *://*.boardgamearena.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/forest-shuffle-tracker/main/forest_shuffle_tracker.user.js
// @downloadURL  https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/forest-shuffle-tracker/main/forest_shuffle_tracker.user.js
// @supportURL   https://github.com/YOUR_GITHUB_USERNAME/forest-shuffle-tracker/issues
// ==/UserScript==

// ========================================================================
// NATIVE DOJO WEBSOCKET INTERCEPTOR
// Injected instantly to capture all BGA live events
// ========================================================================
(function injectDojoInterceptor() {
    const script = document.createElement('script');
    script.textContent = `
        (function() {
            let interceptorActive = false;
            function patchDojo() {
                if (interceptorActive) return true;
                if (!window.dojo || typeof window.dojo.subscribe !== 'function') return false;
                
                const originalSubscribe = window.dojo.subscribe;
                window.dojo.subscribe = function(topic, context, method) {
                    if (typeof topic === 'string' && !topic.startsWith('/')) {
                        const originalMethod = (typeof method === 'string') ? context[method] : method;
                        const hookedMethod = function(notif) {
                            try {
                                window.postMessage({ type: 'FST_BGA_NOTIF', topic: topic, notif: notif }, '*');
                            } catch(e) {}
                            if (typeof originalMethod === 'function') {
                                return originalMethod.apply(context || this, arguments);
                            }
                        };
                        return originalSubscribe.call(this, topic, context, typeof method === 'string' && hookedMethod.name ? hookedMethod : hookedMethod);
                    }
                    return originalSubscribe.apply(this, arguments);
                };
                interceptorActive = true;
                console.log('[FST] Native Dojo Interceptor Active! Listening for live BGA packets.');
                return true;
            }
            if (!patchDojo()) {
                const observer = new MutationObserver(() => patchDojo() && observer.disconnect());
                observer.observe(document, { childList: true, subtree: true });
            }
        })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
})();

(function () {
    'use strict';

    // Global Debug Array for User Support
    window._fst_debug_logs = [];
    const logDebug = (type, data) => {
        window._fst_debug_logs.push({
            time: new Date().toISOString(),
            type: type,
            data: data
        });
        if (window._fst_debug_logs.length > 5000) window._fst_debug_logs.shift();
    };

    // ========================================================================
    // CARD DATABASE — Base + Alpine + Woodland Edge (NO Exploration)
    // Official source: Lookout Games Appendix (2026-03)
    // ========================================================================
    const CARD_DB_STRUCTURE = {
        trees: [
            "Beech", "Birch", "Douglas Fir", "Horse Chestnut",
            "Linden", "Oak", "Silver Fir", "Sycamore",
            "European Larch", "Stone Pine",
            "Elderberry", "Blackthorn", "Common Hazel"
        ],
        top: [
            "Bullfinch", "Camberwell Beauty", "Chaffinch", "Eurasian Jay",
            "Goshawk", "Great Spotted Woodpecker", "Large Tortoiseshell",
            "Peacock Butterfly", "Purple Emperor", "Red Squirrel",
            "Silver-Washed Fritillary", "Tawny Owl",
            "Bearded Vulture", "Golden Eagle", "Common Raven", "Phoebus Apollo",
            "Barn Owl", "Eurasian Magpie", "Map Butterfly", "Nightingale"
        ],
        bottom: [
            "Blackberries", "Chanterelle", "Common Toad", "Fireflies",
            "Fire Salamander", "Fly Agaric", "Hedgehog", "Mole", "Moss",
            "Parasol Mushroom", "Penny Bun", "Pond Turtle", "Stag Beetle",
            "Tree Ferns", "Tree Frog", "Wild Strawberries", "Wood Ant",
            "Alpine Newt", "Black Trumpet", "Blueberry", "Edelweiss", "Gentian",
            "Great Green Bush Cricket",
            "Digitalis", "Stinging Nettle", "Water Vole"
        ],
        sides: [
            "Barbastelle Bat", "Bechstein's Bat", "Beech Marten",
            "Brown Bear", "Brown Long-Eared Bat", "European Badger",
            "European Fat Dormouse", "European Hare", "Fallow Deer",
            "Gnat", "Greater Horseshoe Bat", "Lynx", "Raccoon",
            "Red Deer", "Red Fox", "Roe Deer", "Squeaker",
            "Violet Carpenter Bee", "Wild Boar", "Wolf",
            "Alpine Marmot", "Capercaillie", "Chamois", "Mountain Hare", "Steinbock",
            "Bee Swarm", "Common Pipistrelle", "Crane Fly",
            "European Bison", "European Polecat", "European Wildcat",
            "Savi's Pipistrelle", "Wild Boar (♀)"
        ]
    };

    const CARD_DB = {
        trees: {
            "Beech": { copies: 10 },
            "Birch": { copies: 10 },
            "Douglas Fir": { copies: 7 },
            "Horse Chestnut": { copies: 11 },
            "Linden": { copies: 9 },
            "Oak": { copies: 7 },
            "Silver Fir": { copies: 6 },
            "Sycamore": { copies: 6 },
            "European Larch": { copies: 7, exp: "alpine" },
            "Stone Pine": { copies: 7, exp: "alpine" },
            "Elderberry": { copies: 4, exp: "woodland" },
            "Blackthorn": { copies: 4, exp: "woodland" },
            "Common Hazel": { copies: 4, exp: "woodland" }
        },
        top: {
            "Bullfinch": { copies: 4 },
            "Camberwell Beauty": { copies: 4 },
            "Chaffinch": { copies: 4 },
            "Eurasian Jay": { copies: 4 },
            "Goshawk": { copies: 4 },
            "Great Spotted Woodpecker": { copies: 4 },
            "Large Tortoiseshell": { copies: 4 },
            "Peacock Butterfly": { copies: 4 },
            "Purple Emperor": { copies: 4 },
            "Red Squirrel": { copies: 4 },
            "Silver-Washed Fritillary": { copies: 4 },
            "Tawny Owl": { copies: 4 },
            "Bearded Vulture": { copies: 3, exp: "alpine" },
            "Common Raven": { copies: 2, exp: "alpine" },
            "Golden Eagle": { copies: 3, exp: "alpine" },
            "Phoebus Apollo": { copies: 4, exp: "alpine" },
            "Barn Owl": { copies: 2, exp: "woodland" },
            "Eurasian Magpie": { copies: 3, exp: "woodland" },
            "Map Butterfly": { copies: 4, exp: "woodland" },
            "Nightingale": { copies: 3, exp: "woodland" }
        },
        bottom: {
            "Blackberries": { copies: 3 },
            "Chanterelle": { copies: 2 },
            "Common Toad": { copies: 6 },
            "Fireflies": { copies: 4 },
            "Fire Salamander": { copies: 3 },
            "Fly Agaric": { copies: 2 },
            "Hedgehog": { copies: 3 },
            "Mole": { copies: 2 },
            "Moss": { copies: 3 },
            "Parasol Mushroom": { copies: 2 },
            "Penny Bun": { copies: 2 },
            "Pond Turtle": { copies: 2 },
            "Stag Beetle": { copies: 2 },
            "Tree Ferns": { copies: 3 },
            "Tree Frog": { copies: 3 },
            "Wild Strawberries": { copies: 3 },
            "Wood Ant": { copies: 3 },
            "Alpine Newt": { copies: 3, exp: "alpine" },
            "Black Trumpet": { copies: 2, exp: "alpine" },
            "Blueberry": { copies: 2, exp: "alpine" },
            "Edelweiss": { copies: 2, exp: "alpine" },
            "Gentian": { copies: 3, exp: "alpine" },
            "Great Green Bush Cricket": { copies: 3, exp: "woodland" },
            "Digitalis": { copies: 4, exp: "woodland" },
            "Stinging Nettle": { copies: 3, exp: "woodland" },
            "Water Vole": { copies: 2, exp: "woodland" }
        },
        sides: {
            "Barbastelle Bat": { copies: 3 },
            "Bechstein's Bat": { copies: 3 },
            "Beech Marten": { copies: 5 },
            "Brown Bear": { copies: 3 },
            "Brown Long-Eared Bat": { copies: 3 },
            "European Badger": { copies: 4 },
            "European Fat Dormouse": { copies: 4 },
            "European Hare": { copies: 11 },
            "Fallow Deer": { copies: 4 },
            "Gnat": { copies: 3 },
            "Greater Horseshoe Bat": { copies: 3 },
            "Lynx": { copies: 6 },
            "Raccoon": { copies: 4 },
            "Red Deer": { copies: 5 },
            "Red Fox": { copies: 5 },
            "Roe Deer": { copies: 5 },
            "Squeaker": { copies: 4 },
            "Violet Carpenter Bee": { copies: 4 },
            "Wild Boar": { copies: 5 },
            "Wolf": { copies: 4 },
            "Alpine Marmot": { copies: 4, exp: "alpine" },
            "Capercaillie": { copies: 4, exp: "alpine" },
            "Chamois": { copies: 3, exp: "alpine" },
            "Mountain Hare": { copies: 3, exp: "alpine" },
            "Steinbock": { copies: 3, exp: "alpine" },
            "Bee Swarm": { copies: 3, exp: "woodland" },
            "Common Pipistrelle": { copies: 3, exp: "woodland" },
            "Crane Fly": { copies: 3, exp: "woodland" },
            "European Bison": { copies: 3, exp: "woodland" },
            "European Polecat": { copies: 3, exp: "woodland" },
            "European Wildcat": { copies: 3, exp: "woodland" },
            "Savi's Pipistrelle": { copies: 3, exp: "woodland" },
            "Wild Boar (♀)": { copies: 3, exp: "woodland" }
        }
    };

    const LATIN_MAP = {
        "fagus sylvatica": "Beech",
        "betula pendula": "Birch",
        "pseudotsuga menziesii": "Douglas Fir",
        "aesculus hippocastanum": "Horse Chestnut",
        "tilia platyphyllos": "Linden",
        "quercus robur": "Oak",
        "abies alba": "Silver Fir",
        "acer pseudoplatanus": "Sycamore",
        "larix decidua": "European Larch",
        "pinus cembra": "Stone Pine",
        "sambucus nigra": "Elderberry",
        "prunus spinosa": "Blackthorn",
        "gypaetus barbatus": "Bearded Vulture",
        "aquila chrysaetos": "Golden Eagle",
        "lagopus muta": "Rock Ptarmigan",
        "parnassius phoebus": "Phoebus Apollo",
        "marmota marmota": "Alpine Marmot",
        "ichthyosaura alpestris": "Alpine Newt",
        "leontopodium nivale": "Edelweiss",
        "gentiana": "Gentian",

        "craterellus cornucopioides": "Black Trumpet",
        "vaccinium myrtillus": "Blueberry",
        "tetrao urogallus": "Capercaillie",
        "corvus corax": "Common Raven",
        "bison bonasus": "European Bison",
        "mustela putorius": "European Polecat",
        "tettigonia viridissima": "Great Green Bush Cricket",
        "lepus timidus": "Mountain Hare",
        "capra ibex": "Steinbock",
        "rupicapra rupicapra": "Chamois"
    };

    const CN_MAP = {
        "European Larch": "欧洲落叶松", "Stone Pine": "瑞士五叶松", "Bearded Vulture": "胡兀鹫", "Golden Eagle": "金雕",
        "Phoebus Apollo": "福布绢蝶", "Mountain Hare": "雪兔", "Chamois": "臆羚", "Steinbock": "北山羊",
        "Alpine Marmot": "高山旱獭", "Alpine Newt": "高山欧螈", "Edelweiss": "雪绒花", "Gentian": "龙胆属", "Black Trumpet": "灰喇叭菌",
        "Wild Boar (♀)": "小野猪", "European Wildcat": "欧洲野猫", "Water Vole": "水䶄", "Eurasian Magpie": "欧亚喜鹊",
        "Bee Swarm": "蜂群", "Crane Fly": "大蚊", "Digitalis": "毛地黄", "Stinging Nettle": "刺荨麻", "Map Butterfly": "网丝蛱蝶",
        "European Hare": "欧洲野兔", "Red Fox": "赤狐", "Large Tortoiseshell": "大红蛱蝶", "Wild Boar": "野猪",
        "Common Pipistrelle": "伏翼", "Savi's Pipistrelle": "萨氏伏翼",
        "Barn Owl": "仓鸮", "Nightingale": "夜莺", "Elderberry": "接骨木莓", "Blackthorn": "黑荆棘", "Common Hazel": "欧榛",
        "European Badger": "欧洲狗獾", "Brown Bear": "棕熊", "Beech Marten": "石貂",
        "Blueberry": "蓝莓", "Capercaillie": "西方松鸡", "Common Raven": "渡鸦",
        "European Bison": "欧洲野牛", "European Polecat": "欧洲臭鼬", "Great Green Bush Cricket": "绿螽蟖"
    };

    // ========================================================================
    // CARD REGISTRY — The Single Source of Truth for Card Identity
    // ========================================================================
    class CardRegistry {
        constructor() {
            this.map = {};              // { cardId(string) → [enName, ...] }
            this.nameMap = {};          // { lowercaseKey → { en: enName } }
            this.treeNames = new Set(); // Set of tree English names (never appear on split cards)
            this.splitPairs = {};       // { enName → enName } learned partner relationships
            this.catLookup = {};        // { enName → categoryKey } for CARD_DB lookup
        }

        buildNameMap() {
            const loc = (typeof window._ === 'function') ? window._ : (x => x);
            this.nameMap = {};
            this.treeNames = new Set();
            this.catLookup = {};
            for (const cat in CARD_DB_STRUCTURE) {
                for (const enName of CARD_DB_STRUCTURE[cat]) {
                    const locName = loc(enName);
                    this.nameMap[enName.toLowerCase()] = { en: enName };
                    if (locName.toLowerCase() !== enName.toLowerCase()) {
                        this.nameMap[locName.toLowerCase()] = { en: enName };
                    }
                    this.catLookup[enName] = cat;
                    if (cat === 'trees') this.treeNames.add(enName);
                }
            }
            // Add Latin maps
            for (const [latin, en] of Object.entries(LATIN_MAP)) {
                this.nameMap[latin] = { en: en };
            }
            // Add custom CN translations
            for (const [en, cn] of Object.entries(CN_MAP)) {
                this.nameMap[cn.toLowerCase()] = { en: en };
            }
        }

        // Learn that two names share the same physical card
        learnPair(name1, name2) {
            if (!name1 || !name2 || name1 === name2) return;
            if (this.treeNames.has(name1) || this.treeNames.has(name2)) return;
            this.splitPairs[name1] = name2;
            this.splitPairs[name2] = name1;
        }

        // Register a card ID → English names permanently
        // Architecture: filters tree false-positives, auto-resolves split-card partners
        // INVARIANT: No card has more than 2 species (split card max is 2)
        register(id, names) {
            if (!id || !names) return;
            const sid = String(id);
            let nameArr = Array.isArray(names) ? [...names] : [names];

            // Step 1: Filter out tree names from non-tree cards
            // (DOM scan sometimes picks up tree names from tooltip CSS classes)
            const nonTreeNames = nameArr.filter(n => !this.treeNames.has(n));
            const treeOnlyNames = nameArr.filter(n => this.treeNames.has(n));
            if (nonTreeNames.length > 0 && treeOnlyNames.length > 0) {
                // Mixed tree+non-tree: this is a false positive, keep only non-tree
                nameArr = nonTreeNames;
            }

            // Step 2: Cap at 2 names max — no card has more than 2 species
            if (nameArr.length > 2) {
                nameArr = nameArr.slice(0, 2);
            }

            // Step 3: Auto-resolve split-card partner from learned pairs
            if (nameArr.length === 1 && nameArr[0] !== 'Unknown') {
                const partner = this.splitPairs[nameArr[0]];
                if (partner) nameArr = [nameArr[0], partner];
            }

            // Step 4: Merge — keep the registration with MORE recognized non-Unknown names
            const existing = this.map[sid];
            const existingValid = existing && existing[0] !== 'Unknown';
            if (existingValid) {
                const existingNonUnk = existing.filter(n => n !== 'Unknown').length;
                const newNonUnk = nameArr.filter(n => n !== 'Unknown').length;
                if (existingNonUnk >= newNonUnk) return;
            }
            this.map[sid] = nameArr;
            logDebug('REGISTRY_ADD', { id: sid, names: nameArr });
        }

        getNames(id) {
            return this.map[String(id)] || null;
        }

        // Try to resolve card name from a DOM element via tooltip system
        resolveFromDOM(el) {
            if (!el) return null;
            const id = el.getAttribute('data-id') || (el.id ? el.id.replace('card_', '') : null);
            if (!id) return null;
            const sid = String(id);

            // Already registered?
            if (this.map[sid] && this.map[sid][0] !== 'Unknown') return this.map[sid];

            // Try tooltip lookup with retry
            let retries = 0;
            const tryResolve = () => {
                const names = this._lookupTooltip(sid);
                if (names && names.length > 0) {
                    this.register(sid, names);
                    if (window._fsTrackerUI) window._fsTrackerUI.renderContent();
                    return;
                }
                if (retries < 150) { // 1.5s max
                    retries++;
                    setTimeout(tryResolve, 10);
                }
            };
            tryResolve();
            return this.map[sid] || null;
        }

        // Tooltip lookup: split cards have hint1 (left/top) and hint2 (right/bottom)
        // Strategy: check hint1+hint2 FIRST (trusted, one species each).
        //           Only fall back to card_/empty if hint tooltips don't exist.
        //           This prevents contamination from CSS class names in card_ tooltips.
        _lookupTooltip(id) {
            const gu = window.gameui;
            if (!gu) return null;

            // Phase 1: Check hint1 + hint2 (the trusted per-half tooltips)
            const hintNames = new Set();
            if (gu.tooltips) {
                for (const prefix of ['hint1_card_', 'hint2_card_']) {
                    const key = prefix + id;
                    const tip = gu.tooltips[key];
                    if (tip) {
                        const html = typeof tip === 'string' ? tip : (tip.label || tip.innerHTML || '');
                        const names = this._extractNamesFromHTML(html);
                        for (const n of names) hintNames.add(n);
                    }
                }
            }
            if (hintNames.size > 0) return [...hintNames];

            // Phase 2: Fallback — card_ and bare id (only if no hint tooltips existed)
            if (gu.tooltips) {
                for (const prefix of ['card_', '']) {
                    const key = prefix + id;
                    const tip = gu.tooltips[key];
                    if (tip) {
                        const html = typeof tip === 'string' ? tip : (tip.label || tip.innerHTML || '');
                        const names = this._extractNamesFromHTML(html);
                        if (names.length > 0) return names;
                    }
                }
            }

            try {
                const dijit = window.dijit || (window.require && window.require("dijit/registry"));
                if (dijit) {
                    const tip = dijit.byId('card_' + id);
                    if (tip && tip.label) {
                        const names = this._extractNamesFromHTML(tip.label);
                        if (names.length > 0) return names;
                    }
                }
            } catch (e) { }

            return null;
        }

        // Extract English card names from HTML/text
        _extractNamesFromHTML(html) {
            if (!html) return [];
            const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();
            let matches = [];
            for (const key in this.nameMap) {
                if (text.includes(key)) matches.push(key);
            }
            // Filter out substrings
            matches = matches.filter(m1 => !matches.some(m2 => m1 !== m2 && m2.includes(m1)));
            return matches.map(m => this.nameMap[m].en);
        }

        // Parse cardName from BGA notification (handles string or i18n object)
        parseCardNames(cardNameField) {
            if (!cardNameField) return [];
            if (typeof cardNameField === 'string') {
                return this._extractNamesFromHTML(cardNameField);
            }
            if (typeof cardNameField === 'object') {
                // i18n split card: {log, args: {specie, specie1, specie2}}
                const args = cardNameField.args || cardNameField;
                let found = [];
                for (const k of Object.keys(args)) {
                    if (k === 'i18n' || k === 'css') continue;
                    if (typeof args[k] === 'string') {
                        const names = this._extractNamesFromHTML(args[k]);
                        found.push(...names);
                    }
                }
                return [...new Set(found)];
            }
            return [];
        }
    }

    // ========================================================================
    // GAME STATE — Pure data, zone tracking
    // ========================================================================
    class GameState {
        constructor(registry) {
            this.registry = registry;
            this.players = {};
            this.clearing = new Set();      // Set of cardId strings
            this.graveyard = new Set();     // Set of cardId strings
            this.played = new Map();        // cardId → { player, tree, position }
            this.cave = new Map();          // cardId → playerId
            this.knownHands = new Map();    // cardId → playerId (only cards we've seen identity of)

            this.deckCount = 0;
            this.winterCards = 0;
            this.initialDeckSize = 0;
            this.totalUniverseSize = 0;
            this.removedCount = 0;
            this.hasAlpine = false;
            this.hasWoodland = false;
            this.playerCount = 2;
        }

        initFromGamedatas(gd) {
            const getHandCount = (hand) => {
                if (typeof hand === 'number') return hand;
                if (typeof hand === 'string') return parseInt(hand) || 0;
                if (typeof hand === 'object' && hand !== null) return Object.keys(hand).length;
                return 0;
            };

            if (gd.players) {
                for (const [pid, p] of Object.entries(gd.players)) {
                    this.players[pid] = {
                        id: pid, name: p.name, color: p.color,
                        handCount: getHandCount(p.hand),
                        caveCount: parseInt(p.cave) || 0,
                        score: p.score || 0
                    };

                    // Automatically know our own hand cards at load
                    if (typeof p.hand === 'object' && p.hand !== null) {
                        for (const cid of Object.keys(p.hand)) {
                            this.knownHands.set(String(cid), String(pid));
                        }
                    }

                    // Register all trees and table cards from gamedatas
                    if (p.trees) {
                        for (const [cid, card] of Object.entries(p.trees)) {
                            this.played.set(String(cid), { player: String(pid), tree: card.tree, position: card.position });
                        }
                    }
                    if (p.table) {
                        for (const [cid, card] of Object.entries(p.table)) {
                            this.played.set(String(cid), { player: String(pid), tree: card.tree, position: card.position });
                        }
                    }
                }
                this.playerCount = Object.keys(gd.players).length;
            }

            this.hasAlpine = !!(gd.isAlpine == 1 || gd.isAlpine === true || gd.isAlpine === '1');
            this.hasWoodland = !!(gd.isWoodlands == 1 || gd.isWoodlands === true || gd.isWoodlands === '1');

            // --- Forest Shuffle Official Setup Rules (Removed Cards) ---
            let expansionsCount = (this.hasAlpine ? 1 : 0) + (this.hasWoodland ? 1 : 0);
            this.removedCardsRule = 0; // Number of cards returned to box unseen
            if (expansionsCount === 2) {
                // Two expansions: 10 base removed + scaling
                const removals = { 2: 80, 3: 50, 4: 35, 5: 20 };
                this.removedCardsRule = 10 + (removals[this.playerCount] || 0);
            } else if (expansionsCount === 1) {
                // One expansion: 10 base removed + scaling
                const removals = { 2: 45, 3: 30, 4: 15, 5: 0 };
                this.removedCardsRule = 10 + (removals[this.playerCount] || 0);
            } else {
                // Base game only: specific setup removal (estimated placeholder)
                // Actually base game removes based on player count too, but rule differs slightly.
                // It's 30/20/- cards based on players. We leave this 0 to be safe if no expansions,
                // but actually base game is usually: 2p: remove 30, 3p: remove 20, 4p: remove 10, 5p: 0
                const baseRemovals = { 2: 30, 3: 20, 4: 10, 5: 0 };
                this.removedCardsRule = baseRemovals[this.playerCount] || 0;
            }

            // 动态计算该局游戏的真实总牌数 (Deck + Discard + Clearing + Trees + Table + Cave + Hands)
            let dynamicTotal = 0;
            if (gd.cards) {
                dynamicTotal += parseInt(gd.cards.deck_count) || 0;
                dynamicTotal += parseInt(gd.cards.discard_count) || 0;
                if (gd.cards.clearing) dynamicTotal += Object.keys(gd.cards.clearing).length;
            }
            if (gd.players) {
                for (const p of Object.values(gd.players)) {
                    dynamicTotal += getHandCount(p.hand);
                    dynamicTotal += parseInt(p.cave) || 0;
                    if (p.trees) dynamicTotal += Object.keys(p.trees).length;
                    if (p.table) dynamicTotal += Object.keys(p.table).length;
                }
            }

            this.totalUniverseSize = dynamicTotal;
            this.initialDeckSize = dynamicTotal; // this represents the ACTUAL deck size after removal
            this.removedCount = this.removedCardsRule;

            if (gd.cards) {
                this.deckCount = parseInt(gd.cards.deck_count) || 0;
                if (gd.cards.winterCards) {
                    this.winterCards = typeof gd.cards.winterCards === 'number'
                        ? gd.cards.winterCards
                        : (Array.isArray(gd.cards.winterCards) ? gd.cards.winterCards.length : Object.keys(gd.cards.winterCards).length);
                }
                // Register clearing cards from gamedatas snapshot
                if (gd.cards.clearing) {
                    for (const [cid, card] of Object.entries(gd.cards.clearing)) {
                        this.clearing.add(String(cid));
                    }
                }
            }
        }

        // Zone-based seen counts — query the registry for names
        getSeenCounts() {
            const counts = {};
            const addId = (id) => {
                const names = this.registry.getNames(id);
                if (names) {
                    for (const name of names) {
                        if (name !== 'Unknown') counts[name] = (counts[name] || 0) + 1;
                    }
                }
            };
            this.played.forEach((_, id) => addId(id));
            this.graveyard.forEach(id => addId(id));
            this.clearing.forEach(id => addId(id));
            this.cave.forEach((_, id) => addId(id));
            this.knownHands.forEach((_, id) => addId(id));
            return counts;
        }

        // Get graveyard + cave counts for the library display
        getGraveCaveCounts() {
            const counts = {};
            const addId = (id) => {
                const names = this.registry.getNames(id);
                if (names) {
                    for (const name of names) {
                        if (name !== 'Unknown') counts[name] = (counts[name] || 0) + 1;
                    }
                }
            };
            this.graveyard.forEach(id => addId(id));
            this.cave.forEach((_, id) => addId(id));
            return counts;
        }

        // Move a card to clearing
        toClearing(id) {
            const sid = String(id);
            this.clearing.add(sid);
            this.knownHands.delete(sid);
        }

        // Move a card from clearing to a player's hand
        fromClearingToHand(id, playerId) {
            const sid = String(id);
            this.clearing.delete(sid);
            this.knownHands.set(sid, String(playerId));
        }

        // Move card from hand to played (forest)
        playCard(id, playerId, treeId, position) {
            const sid = String(id);
            this.knownHands.delete(sid);
            this.played.set(sid, { player: String(playerId), tree: treeId, position: position });
        }

        // Flush all clearing → graveyard
        flushClearing() {
            for (const id of this.clearing) {
                this.graveyard.add(id);
            }
            logDebug('FLUSH_CLEARING', { count: this.clearing.size, ids: [...this.clearing] });
            this.clearing.clear();
        }

        // Move cards to cave
        toCave(ids, playerId) {
            for (const id of ids) {
                const sid = String(id);
                this.cave.set(sid, String(playerId));
                this.knownHands.delete(sid);
            }
        }

        // Sync DOM counters as authoritative source
        syncDOMCounters() {
            try {
                const dk = document.getElementById('deck_deckinfo');
                if (dk) this.deckCount = parseInt(dk.textContent) || 0;
                const wt = document.getElementById('counter-wCard');
                if (wt) this.winterCards = parseInt(wt.textContent) || 0;
                for (const pid in this.players) {
                    const hc = document.getElementById(`card-counter-${pid}`);
                    if (hc) this.players[pid].handCount = parseInt(hc.textContent) || 0;
                    const cc = document.getElementById(`cave-counter-${pid}`);
                    if (cc) this.players[pid].caveCount = parseInt(cc.textContent) || 0;
                    const sc = document.getElementById(`player_score_${pid}`);
                    if (sc) this.players[pid].score = parseInt(sc.textContent) || 0;
                }
            } catch (e) { }
        }
    }

    // ========================================================================
    // BGA NOTIFICATION PROCESSOR — Pure ID-driven
    // ========================================================================
    class BGAProcessor {
        constructor(registry, state) {
            this.registry = registry;
            this.state = state;
            this._lastHandSnapshot = new Map(); // pid → Set of cardIds in hand DOM
        }

        processLiveNotification(topic, notif) {
            if (!notif) return;
            logDebug('BGA_NOTIF', { topic, notif });
            const top = topic.toLowerCase();
            const args = notif.args || {};
            const playerId = args.player_id;

            // Register card name from notification if available
            if (args.cardId) {
                const names = args.specie
                    ? this.registry.parseCardNames(args.specie)
                    : this.registry.parseCardNames(args.card_name || args.cardName);
                if (names && names.length > 0) this.registry.register(args.cardId, names);
            }

            // Learn split-card pairs from cardName: {specie1, specie2}
            if (args.cardName && typeof args.cardName === 'object' && args.cardName.args) {
                const cn = args.cardName.args;
                const s1 = cn.specie1, s2 = cn.specie2;
                if (s1 && s2) {
                    const n1 = this.registry.parseCardNames(s1);
                    const n2 = this.registry.parseCardNames(s2);
                    if (n1.length && n2.length) {
                        this.registry.learnPair(n1[0], n2[0]);
                        // Also re-register this card with both names
                        if (args.cardId) {
                            this.registry.register(args.cardId, [...n1, ...n2]);
                        }
                    }
                }
            }

            // Handle events by topic
            if (top === 'playcard') {
                this._handlePlayCard(args, playerId);
            }
            else if (top === 'takecardfromclearing') {
                this._handleTakeFromClearing(args, playerId);
            }
            else if (top === 'newcardonclearing') {
                this._handleNewOnClearing(args);
            }
            else if (top === 'takecardfromdeck') {
                this._handleDrawFromDeck(args, playerId);
            }
            else if (top === 'clearclearing' || top === 'discardclearing') {
                this.state.flushClearing();
            }
            else if (top === 'hibernate' || top.includes('cave')) {
                this._handleHibernate(args, playerId);
            }

            // Sync DOM counters as authoritative backup
            setTimeout(() => {
                this.state.syncDOMCounters();
                if (window._fsTrackerUI) window._fsTrackerUI.renderContent();
            }, 200);
        }

        _handlePlayCard(args, playerId) {
            const cardId = String(args.cardId || '');

            // Register card with full split-card names if available
            let names = [];
            if (args.cardName && typeof args.cardName === 'object' && args.cardName.args) {
                const cn = args.cardName.args;
                if (cn.specie1) names.push(...this.registry.parseCardNames(cn.specie1));
                if (cn.specie2) names.push(...this.registry.parseCardNames(cn.specie2));
                names = [...new Set(names)];
                if (names.length === 2) this.registry.learnPair(names[0], names[1]);
            }
            if (names.length === 0) {
                names = this.registry.parseCardNames(args.specie || args.card_name || args.cardName);
            }
            if (names && names.length > 0 && cardId) this.registry.register(cardId, names);

            // Move played card to forest
            if (cardId) {
                this.state.playCard(cardId, playerId, args.treeId, args.position);
            }

            // Payment cards → clearing (re-resolve via tooltip to learn split pairs)
            const paidIds = args.cards || [];
            for (const pid of paidIds) {
                const sid = String(pid);
                const tooltipNames = this.registry._lookupTooltip(sid);
                if (tooltipNames && tooltipNames.length > 0) {
                    this.registry.register(sid, tooltipNames);
                    if (tooltipNames.length === 2) this.registry.learnPair(tooltipNames[0], tooltipNames[1]);
                } else {
                    this.registry.register(sid, this.registry.getNames(sid) || ['Unknown']);
                }
                this.state.toClearing(sid);
            }

            logDebug('PLAY_CARD', { cardId, names, paidIds, player: playerId });
        }

        _handleTakeFromClearing(args, playerId) {
            const cardId = String(args.cardId || '');
            const names = this.registry.parseCardNames(args.specie || args.card_name || args.cardName);
            if (names && names.length > 0 && cardId) this.registry.register(cardId, names);

            this.state.fromClearingToHand(cardId, playerId);
            logDebug('TAKE_CLEARING', { cardId, names, player: playerId });
        }

        _handleNewOnClearing(args) {
            const cardId = String(args.cardId || '');
            const names = this.registry.parseCardNames(args.specie || args.card_name || args.cardName);
            if (names && names.length > 0 && cardId) this.registry.register(cardId, names);

            this.state.toClearing(cardId);
            if (this.state.deckCount > 0) this.state.deckCount--;
            logDebug('NEW_ON_CLEARING', { cardId, names });
        }

        _handleDrawFromDeck(args, playerId) {
            // Private notifications (with cardId) don't include player_id — it's always "us"
            if (!playerId && args.cardId) {
                try { playerId = window.gameui.player_id; } catch (e) { }
            }
            if (this.state.deckCount > 0) this.state.deckCount--;
            if (playerId && this.state.players[playerId]) {
                this.state.players[playerId].handCount++;
            }
            const cid = args.cardId || args.card_id;
            if (cid && playerId) {
                this.state.knownHands.set(String(cid), String(playerId));
                // Also register the card name from notification
                const names = this.registry.parseCardNames(args.cardName || args.card_name);
                if (names && names.length > 0) this.registry.register(cid, names);
            }
            logDebug('DRAW_DECK', { player: playerId, cardId: cid });
        }

        _handleHibernate(args, playerId) {
            const nb = parseInt(args.nb) || 1;
            if (playerId && this.state.players[playerId]) {
                this.state.players[playerId].handCount -= nb;
                this.state.players[playerId].caveCount += nb;
            }
            // Note: the actual card IDs entering the cave are captured by
            // the global MutationObserver tracking card element removals
            logDebug('HIBERNATE', { player: playerId, nb });
        }

        // Register all currently visible cards in the DOM
        scanAllVisibleCards() {
            const allCards = document.querySelectorAll('.card[data-id]:not(.logCard)');
            for (const el of allCards) {
                const id = el.getAttribute('data-id');
                if (id && !this.registry.getNames(id)) {
                    this.registry.resolveFromDOM(el);
                }
            }
            logDebug('SCAN_VISIBLE', { found: allCards.length, registered: Object.keys(this.registry.map).length });
        }
    }

    // ========================================================================
    // GLOBAL MUTATION OBSERVER — Captures ALL card appearances
    // ========================================================================
    function setupGlobalObserver(registry, state) {
        const gameArea = document.getElementById('game_play_area') || document.getElementById('game_play_area_wrap') || document.body;
        const capturedIds = new Set();

        const observer = new MutationObserver((mutations) => {
            let changed = false;
            for (const m of mutations) {
                if (m.type !== 'childList') continue;
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    // Process added card elements
                    const cards = [];
                    if (node.classList && node.classList.contains('card') && !node.classList.contains('logCard')) {
                        cards.push(node);
                    }
                    // Also check children (batch DOM insertions)
                    if (node.querySelectorAll) {
                        cards.push(...node.querySelectorAll('.card[data-id]:not(.logCard)'));
                    }
                    for (const card of cards) {
                        const id = card.getAttribute('data-id');
                        if (id && !capturedIds.has(id)) {
                            capturedIds.add(id);
                            registry.resolveFromDOM(card);
                            // If this card appeared in clearing, make sure state knows
                            const parent = card.parentElement;
                            if (parent && (parent.id === 'clearing' || parent.id === 'board_cards')) {
                                state.toClearing(id);
                                changed = true;
                            }
                        }
                    }
                }
            }
            if (changed && window._fsTrackerUI) {
                window._fsTrackerUI.renderContent();
            }
        });

        observer.observe(gameArea, { childList: true, subtree: true });
        console.log('[FST] 🌐 Global MutationObserver active on #game_play_area');
        return observer;
    }

    // ========================================================================
    // TRACKER UI — Modern Cross Layout (preserved from v5)
    // ========================================================================
    class TrackerUI {
        constructor(registry, state) {
            this.registry = registry;
            this.state = state;
            this.panel = null;
            this.tooltip = null;
            this.collapsed = false;
            this.showChinese = /^zh/i.test(document.documentElement.lang || navigator.language || 'zh');
        }

        init() {
            this.injectCSS();
            this.createPanel();
            this.setupEvents();
            this.renderContent();
            window._fsTrackerUI = this;
        }

        getPlayerOrder() {
            const sortedIds = [];
            document.querySelectorAll('.player-board').forEach(b => {
                const m = b.id.match(/\d+/);
                if (m) sortedIds.push(m[0]);
            });
            return sortedIds.length ? sortedIds : Object.keys(this.state.players);
        }

        injectCSS() {
            const css = `
                #fst-panel {
                    position: fixed; top: 80px; right: 10px; z-index: 99999;
                    width: 480px; max-height: 85vh;
                    background: rgba(20, 25, 30, 0.95);
                    border: 1px solid rgba(100, 200, 130, 0.4); border-radius: 10px;
                    color: #e0e0e0; font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
                    font-size: 13px; box-shadow: 0 4px 24px rgba(0,0,0,0.5);
                    backdrop-filter: blur(10px); user-select: none;
                    display: flex; flex-direction: column; resize: both; overflow: hidden;
                    min-width: 280px; min-height: 200px;
                }
                #fst-panel.collapsed { height: auto; min-width: 320px; width: auto; min-height: unset !important; resize: none; overflow: hidden; }
                #fst-header {
                    background: linear-gradient(135deg, rgba(40,80,50,0.9), rgba(30,60,40,0.9));
                    border-radius: 10px 10px 0 0; flex-shrink: 0; padding: 4px 0 0 0; cursor: move; position: relative;
                }
                #fst-panel.collapsed #fst-header { border-radius: 10px; }
                .fst-collapse-btn {
                    position: absolute; top: 4px; right: 8px; width: 28px; height: 28px;
                    background: rgba(0,0,0,0.5); border: 1px solid rgba(100,200,130,0.5); border-radius: 4px;
                    color: #8FE89A; cursor: pointer; font-size: 22px; line-height: 22px; padding: 0;
                    display: flex; align-items: center; justify-content: center;
                }
                .fst-collapse-btn:hover { color: #fff; background: rgba(0,0,0,0.8); }
                #fst-summary-bar { padding: 0 12px 6px; display: flex; justify-content: space-between; font-size: 13px; color: #8a9; }
                #fst-summary-bar strong { margin-left: 4px; font-family: monospace; font-size:14px;}
                #fst-content { padding: 8px 10px; overflow-y: auto; flex: 1; scrollbar-width: thin; scrollbar-color: #4a6 transparent; }
                .fst-section { margin-bottom: 8px; border: 1px solid #334155; border-radius: 6px; background: rgba(15, 23, 42, 0.4); }
                .fst-section-title {
                    padding: 6px 10px; background: #334155; font-weight: bold; font-size: 12px;
                    color: #cbd5e1; border-radius: 6px 6px 0 0; display: flex; justify-content: space-between; cursor: pointer;
                }
                .fst-cross-layout {
                    display: grid; grid-template-columns: 2fr 1fr;
                    grid-template-rows: auto auto auto; gap: 4px; width: 100%; margin-top: 4px;
                }
                .fst-cross-cell { background: rgba(15, 23, 42, 0.4); border: 1px solid #334155; border-radius: 6px; padding: 2px; }
                .fst-cross-cell .fst-section-title { font-size: 10px; padding: 4px; background: rgba(51,65,85,0.7); }
                .fst-c-top { grid-column: 1 / 3; grid-row: 1 / 2; }
                .fst-c-sides { grid-column: 1 / 2; grid-row: 2 / 3; }
                .fst-c-tree { grid-column: 2 / 3; grid-row: 2 / 3; }
                .fst-c-bottom { grid-column: 1 / 3; grid-row: 3 / 4; }
                .fst-card-list { padding: 6px 8px; display: flex; flex-wrap: wrap; gap: 4px; }
                .fst-card { background: #334155; padding: 2px 6px; border-radius: 4px; font-size: 11px; border: 1px solid #475569; }
                .fst-card.unknown { background: #475569; color: #94a3b8; border-style: dashed; }
                .fst-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 2px 8px; width: 100%; }
                .fst-row { display: flex; align-items: center; justify-content: space-between; padding: 2px 4px; border-bottom: 1px solid rgba(100,200,130,0.08); font-size: 11px; }
                .fst-row:hover { background: rgba(100,200,130,0.1); border-radius: 4px; }
                .fst-count-high { color: #8FE89A; font-weight: bold; }
                .fst-count-zero { color: #16a34a; font-weight: normal; }
                .fst-count-mid  { color: #fbbf24; font-weight: bold; }
                .fst-count-low  { color: #ef4444; font-weight: bold; }
            `;
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
        }

        createPanel() {
            this.panel = document.createElement('div');
            this.panel.id = 'fst-panel';
            this.panel.innerHTML = `
                <div id="fst-header">
                    <div style="display:flex; justify-content:space-between; padding:6px 14px; align-items:center;">
                        <span style="display:flex; align-items:center;">
                            <span id="fst-title" style="font-weight:bold; font-size:15px; letter-spacing:0.5px;">🌲 森森不息记牌器 test v1</span>
                            <span id="fst-lang" style="color:#60a5fa; cursor:pointer; font-size:10px; margin-left:8px; border-bottom:1px dotted #60a5fa;">EN</span>
                            <span id="fst-download-log" class="fst-loc" data-loc="log" style="color:#3b82f6; cursor:pointer; font-size:10px; margin-left:8px; border-bottom:1px dotted #3b82f6;">🐞日志</span>
                        </span>
                        <button class="fst-collapse-btn" id="fst-toggle">−</button>
                    </div>
                    <div id="fst-summary-bar">
                        <span><span class="fst-loc" data-loc="deck">牌库</span>: <strong id="fst-s-deck" style="color:#cbd5e1">?</strong></span>
                        <span><span class="fst-loc" data-loc="clear">空地</span>: <strong id="fst-s-clear" style="color:#4ade80">0</strong></span>
                        <span><span class="fst-loc" data-loc="grave">墓地</span>: <strong id="fst-s-grave" style="color:#c084fc">0</strong></span>
                        <span><span class="fst-loc" data-loc="winter">冬季</span>: <strong id="fst-s-winter" style="color:#e2e8f0">0/3</strong></span>
                    </div>
                </div>
                <div id="fst-content"></div>
            `;
            document.body.appendChild(this.panel);
        }

        setupEvents() {
            let isDrag = false, sx, sy, sl, st;

            // Allow dragging from anywhere on the panel, but exclude interactive/text areas
            this.panel.addEventListener('mousedown', e => {
                if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A' || e.target.id === 'fst-lang') return;
                if (e.target.closest('.fst-card-list') || e.target.closest('.fst-grid') || e.target.closest('.fst-row')) return;
                isDrag = true; sx = e.clientX; sy = e.clientY;
                const r = this.panel.getBoundingClientRect(); sl = r.left; st = r.top;
            });
            document.addEventListener('mousemove', e => {
                if (!isDrag) return;
                let newTop = st + e.clientY - sy;
                let newLeft = sl + e.clientX - sx;

                // Prevent panel from being dragged completely off screen
                if (newTop < 0) newTop = 0;
                if (newLeft < -400) newLeft = -400;

                this.panel.style.top = newTop + 'px';
                this.panel.style.left = newLeft + 'px';
                this.panel.style.right = 'auto';
            });
            document.addEventListener('mouseup', () => isDrag = false);

            const toggle = this.panel.querySelector('#fst-toggle');
            toggle.addEventListener('click', () => {
                this.collapsed = !this.collapsed;
                this.panel.querySelector('#fst-content').style.display = this.collapsed ? 'none' : 'block';
                toggle.textContent = this.collapsed ? '+' : '−';
                if (this.collapsed) this.panel.classList.add('collapsed');
                else this.panel.classList.remove('collapsed');
            });

            const langBtn = this.panel.querySelector('#fst-lang');
            langBtn.addEventListener('click', () => {
                this.showChinese = !this.showChinese;
                langBtn.textContent = this.showChinese ? 'EN' : '中';
                this.renderContent();
            });

            this.panel.addEventListener('click', (e) => {
                if (e.target.id === 'fst-dump') {
                    const gu = window.gameui;
                    if (gu) {
                        const dumpData = {};
                        if (gu.tooltips) {
                            dumpData.tooltips = Object.keys(gu.tooltips).length;
                            // Grab 3 examples of tooltip HTML
                            dumpData.tooltip_samples = Object.keys(gu.tooltips).filter(k => k.includes('card_')).slice(0, 3).map(k => gu.tooltips[k]);
                        }
                        // Look for other common BGA material dictionaries
                        for (const k of ['card_types', 'material', 'cardsData', 'cards', 'tooltipsHtml']) {
                            if (gu[k]) dumpData[k + '_keys_count'] = Object.keys(gu[k]).length;
                            if (gu.gamedatas && gu.gamedatas[k]) dumpData['gd_' + k + '_keys_count'] = Object.keys(gu.gamedatas[k]).length;
                        }

                        logDebug('BGA_TOOLTIP_PROBE', dumpData);
                        console.log("[FST Dev] Auto Extracted PROBE", dumpData);

                        e.target.textContent = '✅ 已提取';
                        setTimeout(() => e.target.textContent = '📦提取库', 2000);

                        let dumpArea = document.getElementById('fst_dump_area');
                        if (!dumpArea) {
                            dumpArea = document.createElement('textarea');
                            dumpArea.id = 'fst_dump_area';
                            dumpArea.style.cssText = 'width: 100%; height: 150px; font-size: 10px; margin-top: 5px; color: black;';
                            this.panel.querySelector('#fst-content').prepend(dumpArea);
                        }
                        dumpArea.value = JSON.stringify(dumpData);
                    }
                }

                if (e.target.id === 'fst-download-log') {
                    const dump = {
                        debug_logs: window._fst_debug_logs,
                        registry: this.registry.map,
                        clearing: [...this.state.clearing],
                        graveyard: [...this.state.graveyard],
                        played: Object.fromEntries(this.state.played),
                        cave: Object.fromEntries(this.state.cave),
                        knownHands: Object.fromEntries(this.state.knownHands),
                        gamedatas: (typeof window.gameui !== 'undefined') ? window.gameui.gamedatas : null,
                        tooltips: (typeof window.gameui !== 'undefined') ? window.gameui.tooltips : null
                    };
                    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `fst_debug_log_${Date.now()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                }
            });
        }

        renderContent() {
            const content = this.panel.querySelector('#fst-content');
            if (!content) return;

            // Update static structural text based on lang
            const sTitle = this.panel.querySelector('#fst-title');
            if (sTitle) sTitle.textContent = this.getString('title');
            const sLang = this.panel.querySelector('#fst-lang');
            if (sLang) sLang.textContent = this.showChinese ? 'EN' : '中';
            this.panel.querySelectorAll('.fst-loc').forEach(el => {
                const key = el.getAttribute('data-loc');
                if (key) el.textContent = this.getString(key);
            });

            // Sync from DOM as truth
            this.state.syncDOMCounters();

            const clearEl = document.getElementById('board_deckinfo');
            const graveEl = document.getElementById('discard_deckinfo');
            const clearCount = clearEl ? (parseInt(clearEl.textContent) || 0) : this.state.clearing.size;
            const trueGraveCount = graveEl ? (parseInt(graveEl.textContent) || 0) : this.state.graveyard.size;

            let totalCaves = 0;
            for (const pid in this.state.players) totalCaves += this.state.players[pid].caveCount || 0;
            const combinedGraveCount = trueGraveCount + totalCaves;

            const sDeck = this.panel.querySelector('#fst-s-deck');
            const sWinter = this.panel.querySelector('#fst-s-winter');
            const sClear = this.panel.querySelector('#fst-s-clear');
            const sGrave = this.panel.querySelector('#fst-s-grave');
            if (sDeck) sDeck.textContent = `${this.state.deckCount}/${this.state.initialDeckSize}`;
            if (sWinter) sWinter.textContent = `${this.state.winterCards}/3`;
            if (sClear) sClear.textContent = `${clearCount}`;
            if (sGrave) sGrave.textContent = `${combinedGraveCount}`;

            content.innerHTML = this._buildInfoHTML() + this._buildHandHTML() + this._buildLibraryHTML();
        }

        getString(key) {
            const s = {
                title: { cn: '🌲 森森不息记牌器 test v1', en: '🌲 Forest Tracker test v1' },
                deck: { cn: '牌库', en: 'Deck' }, clear: { cn: '空地', en: 'Clearing' },
                grave: { cn: '墓地', en: 'Grave' }, graveCave: { cn: '墓地/洞穴', en: 'Grave/Cave' },
                winter: { cn: '冬卡', en: 'Winter' }, log: { cn: '🐞日志', en: '🐞Log' },
                base: { cn: '基础', en: 'Base' }, alpine: { cn: '高山', en: 'Alpine' }, woodland: { cn: '林地', en: 'Woodland' },
                total: { cn: '总量', en: 'Total' }, cards: { cn: '张', en: 'c' },
                board: { cn: '场面', en: 'Board' }, cave: { cn: '洞穴', en: 'Cave' },
                top: { cn: '⬆️ 树冠', en: '⬆️ Top' }, sides: { cn: '↔️ 左/右', en: '↔️ Sides' },
                tree: { cn: '🌲 树木', en: '🌲 Trees' },
                bottom: { cn: '⬇️ 底部', en: '⬇️ Bottom' }
            };
            return s[key] ? (this.showChinese ? s[key].cn : s[key].en) : key;
        }

        _buildInfoHTML() {
            const s = this.state;
            const regCount = Object.keys(this.registry.map).length;
            // Calculate total unknown hand cards across all players
            let totalHands = 0;
            let knownCount = this.state.knownHands.size;
            for (const pid in s.players) totalHands += s.players[pid].handCount || 0;
            const unknownHands = Math.max(0, totalHands - knownCount);
            const handStr = `🖐️${unknownHands}`;
            return `
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.5); padding:6px 10px; border-radius:4px; margin-bottom:8px; font-size:12px;">
                <span style="display:flex; gap:12px;">
                    <span style="color:#cbd5e1;">✅${this.getString('base')}</span> 
                    <span style="color:#c084fc;opacity:${s.hasAlpine ? 1 : 0.4};">${s.hasAlpine ? '✅' : '⬜'}${this.getString('alpine')}</span> 
                    <span style="color:#16a34a;opacity:${s.hasWoodland ? 1 : 0.4};">${s.hasWoodland ? '✅' : '⬜'}${this.getString('woodland')}</span>
                </span>
                <span style="color:#8a9;">${s.playerCount}p | 📇${regCount} | <span style="color:#facc15;">${handStr}</span> | ${this.getString('total')}:${s.initialDeckSize}</span>
            </div>`;
        }

        getNameFn() {
            const bgaLoc = (typeof window._ === 'function') ? window._ : (x => x);
            return this.showChinese ? (x => CN_MAP[x] || bgaLoc(x) || x) : (x => x);
        }

        _buildHandHTML() {
            // Prune stale knownHands entries — cards that moved to other zones
            const staleIds = [];
            for (const [cid] of this.state.knownHands) {
                if (this.state.played.has(cid) || this.state.graveyard.has(cid) || this.state.clearing.has(cid) || this.state.cave.has(cid)) {
                    staleIds.push(cid);
                }
            }
            for (const sid of staleIds) this.state.knownHands.delete(sid);

            let html = '';
            for (const pid of this.getPlayerOrder()) {
                const p = this.state.players[pid];
                if (!p) continue;
                const loc = this.getNameFn();
                const totalCount = p.handCount;

                // Calculate total cards on board for this player
                let boardCount = 0;
                this.state.played.forEach(info => { if (info.player === pid || info.player === String(pid)) boardCount++; });

                // Collect known hand cards for this player
                const knownCards = [];
                for (const [cid, owner] of this.state.knownHands) {
                    if (owner === pid || owner === String(pid)) {
                        const names = this.registry.getNames(cid);
                        const displayName = names && names.length > 0 && names[0] !== 'Unknown'
                            ? names.map(n => loc(n)).join(' / ')
                            : 'Unknown';
                        knownCards.push({ id: cid, name: displayName });
                    }
                }

                let cards = [];
                for (const c of knownCards) {
                    if (c.name === 'Unknown') {
                        cards.push(`<div class="fst-card unknown">?</div>`);
                    } else {
                        cards.push(`<div class="fst-card">${c.name}</div>`);
                    }
                }
                const remaining = Math.max(0, totalCount - knownCards.length);
                for (let i = 0; i < remaining; i++) cards.push(`<div class="fst-card unknown">?</div>`);

                const scDom = document.getElementById(`player_score_${pid}`);
                const currentScore = scDom ? (parseInt(scDom.textContent) || p.score) : p.score;
                const scoreStr = currentScore ? ` <span style="color:#fbbf24; margin-left:8px; font-weight:bold;">★${currentScore}</span>` : '';
                const boardStr = ` <span style="color:#4ade80; margin-left:8px; font-size:10px;">🌲${this.getString('board')}:${boardCount}</span>`;
                const caveStr = p.caveCount > 0 ? ` <span style="color:#c084fc; margin-left:8px; font-size:10px;">🐾${this.getString('cave')}:${p.caveCount}</span>` : '';

                html += `<div class="fst-section">
                    <div class="fst-section-title">
                        <span style="color:#${p.color || 'fff'}">${p.name}${scoreStr}${boardStr}${caveStr}</span>
                        <span>(${knownCards.length}/${totalCount}${this.getString('cards')})</span>
                    </div>
                    <div class="fst-card-list">${cards.length ? cards.join('') : '<span style="color:#555">-</span>'}</div>
                </div>`;
            }
            return html || '<div style="color:#555; text-align:center; padding:20px;">等待玩家数据...</div>';
        }

        _buildLibraryHTML() {
            const graveCounts = this.state.getGraveCaveCounts();
            return `
            <div class="fst-cross-layout">
                <div class="fst-cross-cell fst-c-top">${this._libCat(this.getString('top'), CARD_DB_STRUCTURE.top, CARD_DB.top, graveCounts)}</div>
                <div class="fst-cross-cell fst-c-sides">${this._libCat(this.getString('sides'), CARD_DB_STRUCTURE.sides, CARD_DB.sides, graveCounts)}</div>
                <div class="fst-cross-cell fst-c-tree">${this._libCat(this.getString('tree'), CARD_DB_STRUCTURE.trees, CARD_DB.trees, graveCounts)}</div>
                <div class="fst-cross-cell fst-c-bottom">${this._libCat(this.getString('bottom'), CARD_DB_STRUCTURE.bottom, CARD_DB.bottom, graveCounts)}</div>
            </div>`;
        }

        _libCat(title, names, db, graveCounts) {
            const loc = this.getNameFn();
            const seenCounts = this.state.getSeenCounts();

            // Sum up all seen species counts to get totalSeenSpecies
            let totalSeenSpecies = 0;
            for (const v of Object.values(seenCounts)) totalSeenSpecies += v;

            // Sum total copies of all active card species in the game
            let totalCopiesAll = 0;
            const allDBs = [CARD_DB.top, CARD_DB.sides, CARD_DB.trees, CARD_DB.bottom];
            const allStructs = [CARD_DB_STRUCTURE.top, CARD_DB_STRUCTURE.sides, CARD_DB_STRUCTURE.trees, CARD_DB_STRUCTURE.bottom];
            for (let i = 0; i < allDBs.length; i++) {
                for (const bn of allStructs[i]) {
                    const inf = allDBs[i] ? allDBs[i][bn] : null;
                    if (!inf) continue;
                    if (inf.exp === 'alpine' && !this.state.hasAlpine) continue;
                    if (inf.exp === 'woodland' && !this.state.hasWoodland) continue;
                    totalCopiesAll += inf.copies;
                }
            }

            // Simple formula: remaining / totalUnseen * deckCount
            const totalUnseen = Math.max(1, totalCopiesAll - totalSeenSpecies);
            const deckCount = this.state.deckCount;

            let rows = '';
            let sectionSeen = 0;
            let sectionTotal = 0;

            for (const baseName of names) {
                const info = db ? db[baseName] : null;
                if (!info) continue;
                if (info.exp === 'alpine' && !this.state.hasAlpine) continue;
                if (info.exp === 'woodland' && !this.state.hasWoodland) continue;

                const locName = loc(baseName);
                const copies = info.copies;
                const seen = seenCounts[baseName] || 0;

                sectionSeen += seen;
                sectionTotal += copies;

                const remaining = Math.max(0, copies - seen);
                const gCount = graveCounts[baseName] || 0;

                let nameColor = info.exp === 'alpine' ? '#c084fc' : (info.exp === 'woodland' ? '#16a34a' : '#cbd5e1');
                let colorClass = 'fst-count-high';
                if (copies > 0) {
                    if (seen === 0) {
                        colorClass = 'fst-count-zero';
                    } else if (copies <= 2) {
                        if (remaining <= 1) colorClass = 'fst-count-low';
                    } else {
                        const theoreticalPool = Math.max(1, this.state.totalUniverseSize + this.state.removedCount);
                        const initialExpected = copies * (this.state.totalUniverseSize / theoreticalPool);
                        const seenPct = initialExpected > 0 ? (seen / initialExpected) : 0;
                        if (remaining <= 1 || seenPct >= 0.66) colorClass = 'fst-count-low';
                        else if (seenPct > 0.33) colorClass = 'fst-count-mid';
                    }
                }

                const expected = Math.round(remaining * (deckCount / totalUnseen) * 10) / 10;

                const gHtml = gCount > 0 ? `<span style="color:#c084fc; font-size:10px; margin:0 4px;" title="墓地/洞穴中有 ${gCount} 张">⚰️${gCount}</span>` : `<span style="display:inline-block; width:22px;"></span>`;

                rows += `<div class="fst-row">
                    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:80px; color:${nameColor};" title="${locName}">${locName}</span>
                    <span style="min-width:65px; text-align:right; font-family:monospace; font-size:12px; display:flex; justify-content:flex-end; align-items:center;">
                        <span class="${colorClass}">${seen}</span><span style="color:#e2e8f0">/${copies}</span>
                        ${gHtml}
                        <span style="color:#7a8a9a;font-size:10px;width:18px;text-align:right;">${expected}</span>
                    </span>
                </div>`;
            }
            return `<div class="fst-section-title" style="cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'grid':'none'">
                <span>${title} <span style="font-size:10px; color:#8a9; margin-left:8px; font-weight:normal;">${sectionSeen}/${sectionTotal}</span></span>
                <span style="font-size:10px; opacity:0.7;">▼</span>
            </div><div class="fst-grid" style="display:grid;">${rows}</div>`;
        }
    }

    // ========================================================================
    // MAIN ENTRY POINT
    // ========================================================================
    function startTracker() {
        const checkReady = setInterval(() => {
            try {
                const gu = (typeof window.gameui !== 'undefined') ? window.gameui : null;
                if (gu && gu.gamedatas && gu.gamedatas.players) {
                    clearInterval(checkReady);

                    // 1. Build CardRegistry
                    const registry = new CardRegistry();
                    registry.buildNameMap();

                    // 2. Build GameState
                    const state = new GameState(registry);
                    state.initFromGamedatas(gu.gamedatas);

                    // 3. Build Processor
                    const processor = new BGAProcessor(registry, state);

                    // 4. Build UI
                    const ui = new TrackerUI(registry, state);
                    ui.init();

                    // 5. Setup Global Observer (captures all card DOM appearances)
                    setupGlobalObserver(registry, state);

                    // 6. Initial scan — register all currently visible cards
                    processor.scanAllVisibleCards();
                    state.syncDOMCounters();
                    ui.renderContent();

                    // 7. Expose debug globals
                    window._fst_registry = registry;
                    window._fst_state = state;

                    // 8. Listen for live BGA notifications
                    window.addEventListener('message', (event) => {
                        if (event.data && event.data.type === 'FST_BGA_NOTIF') {
                            processor.processLiveNotification(event.data.topic, event.data.notif);
                        }
                    });

                    // 9. Periodic DOM sync (every 2 seconds)
                    setInterval(() => {
                        state.syncDOMCounters();
                        ui.renderContent();
                    }, 2000);

                    console.log(`[FST] test v1 Card Registry Tracker active! Registry: ${Object.keys(registry.map).length} cards, Players: ${state.playerCount}`);
                }
            } catch (e) {
                console.error('[FST] Init error:', e);
            }
        }, 500);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startTracker);
    else startTracker();

})();
