(function () {
    if (window.AdaptiveWeb) return;

    const CONFIG = {
        // Feature 1: Reading Difficulty
        difficultyRevisitCount: 3,
        difficultyTimeWindow: 60000,
        difficultyMinReturnGap: 1200,
        difficultyMinChars: 180,
        difficultyMaxChars: 6000,
        difficultyMinDwell: 4000,
        difficultyMaxDwell: 12000,
        difficultyVisibilityRatio: 0.45,
        difficultyVisiblePixels: 140,
        difficultyPointerDwell: 2500,
        difficultyConfidence: 0.7,
        difficultyPromptCooldown: 90000,
        difficultyGlobalCooldown: 30000,
        difficultyPromptLimit: 3,
        difficultyPostScrollDelay: 700,
        difficultyMutationDelay: 250,

        // Feature 2: Engaged Reader
        engagedScrollMaxSpeed: 300, // px/s
        engagedHoverTime: 3000,
        engagedMinDepth: 0.5, // 50%

        // Feature 3: Skimmer
        skimScrollMinSpeed: 800,
        skimEventCount: 3,
        skimTimeWindow: 5000,
        tldrIdleDelay: 750,
        tldrMinParagraphChars: 280,
        tldrMaxParagraphs: 12,
        tldrDynamicContentDelay: 250,

        // Scroll-back auto-summary
        scrollSampleInterval: 60,
        scrollMinRange: 480,
        scrollDeepThreshold: 0.72,
        scrollBottomThreshold: 0.85,
        scrollReturnThreshold: 0.2,
        scrollMinTravelRatio: 0.55,
        scrollMinReturnRatio: 0.45,
        scrollReverseWindow: 12000,
        scrollReturnWindow: 18000,
        scrollGestureWindow: 45000,
        scrollIdleReset: 8000,
        scrollSummaryCooldown: 120000,
        scrollSummarySessionLimit: 2,
        scrollContentSampleInterval: 250,
        scrollContentMaxChars: 6000,

        // Feature 4: Exit Intent
        exitThresholdY: 50,

        // Advanced Cursor Hesitation
        cursorSampleWindow: 4000,
        cursorSampleInterval: 60,
        cursorAnalysisInterval: 250,
        cursorSuspectScore: 0.55,
        cursorConfirmScore: 0.72,
        cursorConfirmationTime: 600,
        cursorStationaryTime: 1600,
        cursorCooldown: 30000,
        cursorDismissCooldown: 90000,
        cursorPromptLimit: 3,

        serverUrl: 'http://localhost:8000/api',
        debug: true
    };

    class BehaviorDetector {
        constructor(ui) {
            this.ui = ui;
            this.api = new ApiService();

            this.initScrollAnalysis();
            // this.initParagraphTracking(); // Disable "Simplify" feature as requested
            this.initExitIntent();
            this.initHoverDwell(); // New Universal Hover
        }

        // --- Feature 5: Universal Hover Dwell ---
        initHoverDwell() {
            let hoverTimer = null;
            let currentTarget = null;

            document.body.addEventListener('mouseover', (e) => {
                const target = e.target.closest('p, article, h1, h2, h3, li');
                if (!target || this.isAdaptiveWebElement(target) || target === currentTarget) return;

                // Clear previous
                if (hoverTimer) clearTimeout(hoverTimer);
                if (currentTarget) this.ui.removeHoverEffect(currentTarget);

                currentTarget = target;

                // Start Timer (1.5s as requested)
                hoverTimer = setTimeout(() => {
                    if (currentTarget && currentTarget.isConnected) {
                        this.onHoverDwell(currentTarget);
                    }
                }, 1500);
            }, { passive: true });

            document.body.addEventListener('mouseout', (e) => {
                if (!currentTarget) return;

                // Only clear if we really left the element (not just moved to a child)
                if (currentTarget.contains(e.relatedTarget)) return;

                if (hoverTimer) clearTimeout(hoverTimer);
                this.ui.removeHoverEffect(currentTarget);
                currentTarget = null;
            }, { passive: true });

            // Clear on scroll to prevent sticky highlights
            window.addEventListener('scroll', () => {
                if (hoverTimer) clearTimeout(hoverTimer);
                if (currentTarget) this.ui.removeHoverEffect(currentTarget);
                currentTarget = null;
            }, { passive: true });
        }

        onHoverDwell(element) {
            if (CONFIG.debug) console.log('Detected: Universal Hover Dwell', element);

            // Smarter Theme Detection: Traverse up to find effective background
            const bgColor = this.getEffectiveBackgroundColor(element);
            const isDark = this.isDarkColor(bgColor);

            this.ui.applyHoverEffect(element, isDark, this.api);
            this.api.log('hover_dwell', {
                tag: element.tagName,
                text_len: element.innerText.length,
                theme: isDark ? 'dark' : 'light',
                bg_color: bgColor
            });
        }

        getEffectiveBackgroundColor(el) {
            let current = el;
            while (current) {
                const style = window.getComputedStyle(current);
                const color = style.backgroundColor;
                // Check if transparent (rgba(0,0,0,0) or transparent)
                if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
                    return color;
                }
                current = current.parentElement;
            }
            return 'rgb(255, 255, 255)'; // Fallback to white (Light Mode) if no bg found
        }

        isDarkColor(color) {
            if (!color) return false;

            const rgb = color.match(/\d+/g);
            if (!rgb) return false;

            // Luminance formula
            const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
            return brightness < 128; // < 128 is dark
        }

        // --- Feature 1: Reading Difficulty (Re-reading) ---
        initParagraphTracking() {
            const paragraphs = document.querySelectorAll('p');
            // Store revisit timestamps: Map<Element, number[]>
            this.paragraphVisits = new Map();

            // IntersectionObserver to detect when a paragraph enters viewport
            const observer = new IntersectionObserver((entries) => {
                const now = Date.now();
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.registerVisit(entry.target, now);
                    }
                });
            }, { threshold: 0.8 }); // Must be 80% visible

            paragraphs.forEach(p => observer.observe(p));
        }

        registerVisit(p, time) {
            if (!this.paragraphVisits.has(p)) {
                this.paragraphVisits.set(p, []);
            }
            const visits = this.paragraphVisits.get(p);
            // Clean old visits
            while (visits.length > 0 && time - visits[0] > CONFIG.difficultyTimeWindow) {
                visits.shift();
            }
            visits.push(time);

            // Check Trigger
            if (visits.length >= CONFIG.difficultyRevisitCount) {
                if (!p.classList.contains('aw-difficulty-processed')) {
                    this.onReadingDifficulty(p);
                }
            }
        }

        onReadingDifficulty(p) {
            if (CONFIG.debug) console.log('Detected: Reading Difficulty', p);
            p.classList.add('aw-difficulty-processed');
            this.ui.highlightAndPrompt(p, async () => {
                const simplified = await this.api.simplify(p.innerText);
                if (simplified) this.ui.updateParagraph(p, simplified.simplified);
            });
            this.api.log('reading_difficulty', { text_len: p.innerText.length });
        }

        // --- Feature 2 & 3: Scroll-back Summary, Rapid Skim, and Engaged Reader ---
        initScrollAnalysis() {
            if (this.scrollAnalysisInitialized) return;
            this.scrollAnalysisInitialized = true;
            this.scrollTrackers = new Map();
            this.scrollSummaryInFlight = false;
            this.scrollProgrammaticUntil = 0;
            this.tldrIdleTimers = new Map();
            this.tldrSessions = new Map();
            this.tldrParagraphId = 0;
            this.activeTldrSource = null;

            const handleWindowScroll = (event) => this.handleScrollEvent(window, event);
            const handleCapturedScroll = (event) => {
                const source = this.getScrollSource(event.target);
                if (source !== window) this.handleScrollEvent(source, event);
            };

            window.addEventListener('scroll', handleWindowScroll, { passive: true });
            document.addEventListener('scroll', handleCapturedScroll, { passive: true, capture: true });

            window.addEventListener('pagehide', () => {
                window.removeEventListener('scroll', handleWindowScroll);
                document.removeEventListener('scroll', handleCapturedScroll, true);
                this.tldrIdleTimers.forEach(timer => clearTimeout(timer));
                this.tldrSessions.forEach(session => {
                    session.observer?.disconnect();
                    if (session.observerTimer) clearTimeout(session.observerTimer);
                });
                this.tldrIdleTimers.clear();
                this.tldrSessions.clear();
                this.scrollTrackers.clear();
            }, { once: true });
        }

        getScrollSource(target) {
            if (!target || target === document || target === document.documentElement || target === document.body) {
                return window;
            }
            return target && typeof target.scrollTop === 'number' ? target : window;
        }

        getScrollMetrics(source) {
            if (source === window) {
                const scrollingElement = document.scrollingElement || document.documentElement;
                const scrollHeight = Math.max(
                    scrollingElement?.scrollHeight || 0,
                    document.documentElement?.scrollHeight || 0,
                    document.body?.scrollHeight || 0
                );
                const viewportSize = Math.max(1, window.innerHeight || scrollingElement?.clientHeight || 1);
                const range = Math.max(0, scrollHeight - viewportSize);
                const position = Math.max(0, window.scrollY || scrollingElement?.scrollTop || 0);
                return {
                    position,
                    viewportSize,
                    scrollHeight,
                    range,
                    depth: range > 0 ? Math.max(0, Math.min(1, position / range)) : 0
                };
            }

            const viewportSize = Math.max(1, source.clientHeight || 1);
            const scrollHeight = Math.max(viewportSize, source.scrollHeight || viewportSize);
            const range = Math.max(0, scrollHeight - viewportSize);
            const position = Math.max(0, source.scrollTop || 0);
            return {
                position,
                viewportSize,
                scrollHeight,
                range,
                depth: range > 0 ? Math.max(0, Math.min(1, position / range)) : 0
            };
        }

        createScrollTracker(metrics, now = Date.now()) {
            return {
                state: 'idle',
                lastPosition: metrics.position,
                lastTime: now,
                lastActiveAt: now,
                lastRange: metrics.range,
                startedAt: 0,
                startPosition: metrics.position,
                maxPosition: metrics.position,
                maxDepth: metrics.depth,
                totalDownward: 0,
                totalUpward: 0,
                totalDistance: 0,
                fastEvents: [],
                fastEventTotal: 0,
                rapidSkimSignaled: false,
                tldrHandled: false,
                reachedDeepAt: 0,
                reachedBottomAt: 0,
                reversedAt: 0,
                contentSnippets: new Map(),
                lastContentAt: 0,
                cooldownUntil: 0,
                triggered: false
            };
        }

        resetScrollTracker(tracker, metrics, now = Date.now(), preserveCooldown = false) {
            const cooldownUntil = preserveCooldown ? tracker.cooldownUntil : 0;
            const fresh = this.createScrollTracker(metrics, now);
            Object.assign(tracker, fresh, {
                state: preserveCooldown && cooldownUntil > now ? 'cooldown' : 'idle',
                cooldownUntil
            });
            return tracker;
        }

        processScrollSample(tracker, metrics, now = Date.now()) {
            const result = { rapidSkim: false, triggerSummary: false };
            if (!tracker || !metrics || metrics.range < CONFIG.scrollMinRange) return result;

            if (tracker.lastRange > 0 && Math.abs(metrics.range - tracker.lastRange) / tracker.lastRange > 0.35) {
                this.resetScrollTracker(tracker, metrics, now);
                return result;
            }
            tracker.lastRange = metrics.range;

            if (tracker.state === 'cooldown') {
                tracker.lastPosition = metrics.position;
                tracker.lastTime = now;
                if (now < tracker.cooldownUntil) return result;
                this.resetScrollTracker(tracker, metrics, now);
                return result;
            }

            const elapsed = now - tracker.lastTime;
            const delta = metrics.position - tracker.lastPosition;
            if (elapsed < CONFIG.scrollSampleInterval) return result;
            tracker.lastPosition = metrics.position;
            tracker.lastTime = now;
            if (Math.abs(delta) < 2) return result;

            if (
                tracker.state !== 'idle' &&
                tracker.state !== 'bottom' &&
                tracker.state !== 'returning' &&
                now - tracker.lastActiveAt > CONFIG.scrollIdleReset
            ) {
                this.resetScrollTracker(tracker, metrics, now);
            }
            tracker.lastActiveAt = now;

            const direction = delta > 0 ? 'down' : 'up';
            const distance = Math.abs(delta);
            const speed = (distance / Math.max(elapsed, 1)) * 1000;

            if (tracker.state === 'idle') {
                if (direction !== 'down') return result;
                tracker.state = 'descending';
                tracker.startedAt = now;
                tracker.startPosition = Math.max(0, metrics.position - Math.max(delta, 0));
                tracker.maxPosition = metrics.position;
                tracker.maxDepth = metrics.depth;
            }

            tracker.totalDistance += distance;
            if (speed >= CONFIG.skimScrollMinSpeed) {
                tracker.fastEvents.push(now);
                tracker.fastEventTotal += 1;
            }
            tracker.fastEvents = tracker.fastEvents.filter(time => now - time <= CONFIG.skimTimeWindow);
            if (!tracker.rapidSkimSignaled && tracker.fastEvents.length >= CONFIG.skimEventCount) {
                tracker.rapidSkimSignaled = true;
                result.rapidSkim = true;
            }

            if (direction === 'down') {
                tracker.totalDownward += distance;
                tracker.maxPosition = Math.max(tracker.maxPosition, metrics.position);
                tracker.maxDepth = Math.max(tracker.maxDepth, metrics.depth);

                if (tracker.state === 'returning' && distance > Math.max(60, metrics.range * 0.08)) {
                    tracker.state = tracker.maxDepth >= CONFIG.scrollBottomThreshold ? 'bottom' : 'deep';
                    tracker.reversedAt = 0;
                    tracker.totalUpward = 0;
                }
                if (tracker.maxDepth >= CONFIG.scrollDeepThreshold && !tracker.reachedDeepAt) {
                    tracker.reachedDeepAt = now;
                    tracker.state = 'deep';
                }
                if (tracker.maxDepth >= CONFIG.scrollBottomThreshold) {
                    if (!tracker.reachedBottomAt) tracker.reachedBottomAt = now;
                    tracker.state = 'bottom';
                }
                return result;
            }

            if (!tracker.reachedBottomAt || tracker.maxDepth < CONFIG.scrollBottomThreshold) return result;
            if (now - tracker.reachedBottomAt > CONFIG.scrollReverseWindow && !tracker.reversedAt) {
                this.resetScrollTracker(tracker, metrics, now);
                return result;
            }
            if (!tracker.reversedAt) {
                tracker.reversedAt = now;
                tracker.state = 'returning';
            }
            tracker.totalUpward += distance;

            const downwardTravelRatio = Math.max(0, tracker.maxPosition - tracker.startPosition) / metrics.range;
            const returnTravelRatio = Math.max(0, tracker.maxPosition - metrics.position) / metrics.range;
            const gestureDuration = now - tracker.startedAt;
            const returnDuration = now - tracker.reversedAt;
            const averageSpeed = tracker.totalDistance / Math.max(gestureDuration / 1000, 0.001);
            const skimConfirmed = tracker.rapidSkimSignaled || averageSpeed >= 450;

            if (
                metrics.depth <= CONFIG.scrollReturnThreshold &&
                downwardTravelRatio >= CONFIG.scrollMinTravelRatio &&
                returnTravelRatio >= CONFIG.scrollMinReturnRatio &&
                returnDuration <= CONFIG.scrollReturnWindow &&
                gestureDuration <= CONFIG.scrollGestureWindow &&
                skimConfirmed
            ) {
                result.triggerSummary = true;
                result.metadata = {
                    maxDepth: tracker.maxDepth,
                    downwardTravelRatio,
                    returnTravelRatio,
                    gestureDuration,
                    returnDuration,
                    averageSpeed,
                    fastEventTotal: tracker.fastEventTotal
                };
                tracker.triggered = true;
                tracker.state = 'cooldown';
                tracker.cooldownUntil = now + CONFIG.scrollSummaryCooldown;
            }
            return result;
        }

        handleScrollEvent(source, event) {
            const now = Date.now();
            if (now < this.scrollProgrammaticUntil) return;
            if (source !== window && this.isAdaptiveWebElement(source)) return;
            this.ui.dismissTldrPrompt?.('scroll-resumed');

            const metrics = this.getScrollMetrics(source);
            if (metrics.range < CONFIG.scrollMinRange) return;
            let tracker = this.scrollTrackers.get(source);
            if (!tracker) {
                tracker = this.createScrollTracker(metrics, now);
                this.scrollTrackers.set(source, tracker);
            }

            this.recordScrollContent(source, tracker, now);
            const result = this.processScrollSample(tracker, metrics, now);

            if (result.rapidSkim) this.onRapidSkimDetected(source, tracker, result.metadata);
            else if (tracker.rapidSkimSignaled && !tracker.tldrHandled) this.scheduleTldrAssistance(source, tracker);
            if (result.triggerSummary) this.onScrollBackSummaryDetected(source, tracker, result.metadata);

            if (source === window) {
                const elapsed = Math.max(now - (tracker.previousEngagedAt || now), 1);
                const previousPosition = tracker.previousEngagedPosition ?? metrics.position;
                const speed = Math.abs(metrics.position - previousPosition) / elapsed * 1000;
                tracker.previousEngagedAt = now;
                tracker.previousEngagedPosition = metrics.position;
                this.checkEngaged(now, speed, metrics.position);
            }
        }

        onRapidSkimDetected(source, tracker) {
            if (CONFIG.debug) console.log('Detected: Rapid Skim', { source: source === window ? 'window' : 'container' });
            this.ui.showScrollToast('Rapid skimming detected. Pause to choose a compact reading view.');
            this.scheduleTldrAssistance(source, tracker);
            this.api.log('rapid_skim_detected', {
                source_type: source === window ? 'window' : 'container',
                max_depth: Number(tracker.maxDepth.toFixed(2)),
                fast_event_count: tracker.fastEventTotal
            });
        }

        async onScrollBackSummaryDetected(source, tracker, metadata) {
            if (this.shouldSuppressScrollSummary(source)) return;
            this.scrollSummaryInFlight = true;
            this.setScrollSummaryCount(this.getScrollSummaryCount() + 1);

            const summaryText = this.buildScrollSummaryText(source, tracker);
            const localSummary = this.buildLocalScrollSummary(summaryText);
            const sourceLabel = source === window ? 'Page' : 'Scrollable section';
            const requestId = this.ui.showScrollSummaryLoading({ sourceLabel, maxDepth: metadata.maxDepth });
            this.api.log('scroll_back_summary', {
                source_type: source === window ? 'window' : 'container',
                max_depth: Number(metadata.maxDepth.toFixed(2)),
                downward_travel_ratio: Number(metadata.downwardTravelRatio.toFixed(2)),
                return_travel_ratio: Number(metadata.returnTravelRatio.toFixed(2)),
                gesture_duration_ms: Math.round(metadata.gestureDuration),
                average_speed: Math.round(metadata.averageSpeed),
                fast_event_count: metadata.fastEventTotal
            });

            try {
                const response = summaryText.length >= 120 ? await this.api.summarize(summaryText) : null;
                const hasRemoteSummary = Boolean(response && response.summary);
                const method = hasRemoteSummary && !String(response.method || '').startsWith('fallback')
                    ? 'Gemini summary'
                    : 'Local summary';
                const summary = hasRemoteSummary && method === 'Gemini summary'
                    ? response.summary
                    : localSummary;
                this.ui.showScrollSummary({
                    requestId,
                    summary,
                    method,
                    sourceLabel,
                    maxDepth: metadata.maxDepth,
                    onReadFromStart: () => this.scrollSourceToStart(source),
                    onDismiss: () => this.api.log('scroll_back_summary_dismissed', {
                        source_type: source === window ? 'window' : 'container'
                    })
                });
            } catch (error) {
                if (CONFIG.debug) console.debug('AdaptiveWeb summary request used the local fallback', error);
                this.ui.showScrollSummary({
                    requestId,
                    summary: localSummary,
                    method: 'Local summary',
                    sourceLabel,
                    maxDepth: metadata.maxDepth,
                    onReadFromStart: () => this.scrollSourceToStart(source),
                    onDismiss: () => this.api.log('scroll_back_summary_dismissed', {
                        source_type: source === window ? 'window' : 'container'
                    })
                });
            } finally {
                this.scrollSummaryInFlight = false;
            }
        }

        shouldSuppressScrollSummary(source) {
            if (this.scrollSummaryInFlight || document.hidden) return true;
            if (this.getScrollSummaryCount() >= CONFIG.scrollSummarySessionLimit) return true;
            if (document.querySelector('.aw-summary-box, .aw-modal-backdrop')) return true;
            if (window.getSelection && window.getSelection().toString().trim()) return true;
            if (source !== window && (!source || !source.isConnected)) return true;
            const activeMedia = Array.from(document.querySelectorAll('video, audio'))
                .some(media => !media.paused && !media.ended);
            return activeMedia;
        }

        recordScrollContent(source, tracker, now = Date.now()) {
            if (now - tracker.lastContentAt < CONFIG.scrollContentSampleInterval) return;
            tracker.lastContentAt = now;
            const root = source === window
                ? document.querySelector('main, article') || document.body
                : source;
            if (!root || !root.querySelectorAll) return;

            const sourceRect = source === window
                ? { top: 0, bottom: window.innerHeight }
                : source.getBoundingClientRect();
            const elements = root.querySelectorAll('h1, h2, h3, h4, p, li');
            for (const element of elements) {
                if (this.isAdaptiveWebElement(element)) continue;
                const rect = element.getBoundingClientRect();
                if (rect.bottom < sourceRect.top || rect.top > sourceRect.bottom) continue;
                const text = this.redactSensitiveText(element.innerText || element.textContent || '').slice(0, 700);
                if (text.length < 20) continue;
                const type = /^H[1-4]$/.test(element.tagName) ? element.tagName : 'TEXT';
                const key = `${type}:${text.slice(0, 100)}`;
                if (!tracker.contentSnippets.has(key)) tracker.contentSnippets.set(key, { type, text });
                if (tracker.contentSnippets.size >= 40) break;
            }
        }

        buildScrollSummaryText(source, tracker) {
            const sourceLabel = source === window ? 'full page' : 'scrollable section';
            const snippets = Array.from(tracker.contentSnippets.values());
            let content = snippets.map(item => `[${item.type}] ${item.text}`).join('\n');
            if (content.length < 240) {
                const root = source === window
                    ? document.querySelector('main, article') || document.body
                    : source;
                content = this.redactSensitiveText(root?.innerText || root?.textContent || '');
            }
            return [
                `Page title: ${this.redactSensitiveText(document.title).slice(0, 160)}`,
                `Content source: ${sourceLabel}`,
                'Behavior: The user rapidly skimmed deep into this content and returned near the beginning.',
                'Create three concise key takeaways from only the content below.',
                '',
                content.slice(0, CONFIG.scrollContentMaxChars)
            ].join('\n');
        }

        buildLocalScrollSummary(summaryText) {
            const lines = String(summaryText || '')
                .split(/\n+/)
                .map(line => line.replace(/^\[(?:H[1-4]|TEXT)\]\s*/, '').trim())
                .filter(line => line.length >= 30 && !/^(Page title|Content source|Behavior|Create three)/i.test(line));
            const takeaways = [];
            for (const line of lines) {
                const sentences = line.match(/[^.!?]+[.!?]?/g) || [line];
                for (const rawSentence of sentences) {
                    const sentence = rawSentence.trim();
                    if (sentence.length < 30 || takeaways.some(item => item.toLowerCase() === sentence.toLowerCase())) continue;
                    takeaways.push(sentence.slice(0, 180));
                    if (takeaways.length >= 3) break;
                }
                if (takeaways.length >= 3) break;
            }
            if (takeaways.length === 0) {
                return '- Review the main headings in this section.\n- Revisit any controls or details skipped during the rapid scroll.\n- Continue reading from the beginning when ready.';
            }
            return takeaways.map(item => `- ${item}`).join('\n');
        }

        scheduleTldrAssistance(source, tracker) {
            if (!tracker || tracker.tldrHandled || this.tldrSessions?.get(source)?.active) return;
            const preference = this.getTldrPreference();
            if (preference === 'off') {
                tracker.tldrHandled = true;
                return;
            }

            if (!this.tldrIdleTimers) this.tldrIdleTimers = new Map();
            const existingTimer = this.tldrIdleTimers.get(source);
            if (existingTimer) clearTimeout(existingTimer);
            const timer = setTimeout(() => {
                this.tldrIdleTimers.delete(source);
                if (tracker.tldrHandled) return;
                tracker.tldrHandled = true;

                if (preference === 'auto') {
                    this.applyRapidSkimMode(source, { automatic: true });
                    return;
                }

                this.ui.showTldrPrompt({
                    sourceLabel: source === window ? 'this page' : 'this section',
                    onApply: () => this.applyRapidSkimMode(source, { automatic: false }),
                    onAlways: () => {
                        this.setTldrPreference('auto');
                        this.applyRapidSkimMode(source, { automatic: true });
                    },
                    onDismiss: reason => this.api.log('tldr_prompt_dismissed', {
                        source_type: source === window ? 'window' : 'container',
                        reason
                    })
                });
            }, CONFIG.tldrIdleDelay);
            this.tldrIdleTimers.set(source, timer);
        }

        getTldrPreference() {
            try {
                const domain = window.location?.hostname || 'local';
                if (sessionStorage.getItem(`aw-tldr-off-v1:${domain}`) === 'true') return 'off';
                const stored = localStorage.getItem(`aw-tldr-mode-v1:${domain}`);
                return stored === 'auto' ? 'auto' : 'ask';
            } catch (error) {
                return 'ask';
            }
        }

        setTldrPreference(mode) {
            const safeMode = ['ask', 'auto', 'off'].includes(mode) ? mode : 'ask';
            try {
                const domain = window.location?.hostname || 'local';
                const sessionKey = `aw-tldr-off-v1:${domain}`;
                const persistentKey = `aw-tldr-mode-v1:${domain}`;
                if (safeMode === 'off') {
                    sessionStorage.setItem(sessionKey, 'true');
                } else {
                    sessionStorage.removeItem(sessionKey);
                    localStorage.setItem(persistentKey, safeMode);
                }
            } catch (error) {
                if (CONFIG.debug) console.debug('AdaptiveWeb TL;DR preference could not be saved', error);
            }
            return safeMode;
        }

        applyRapidSkimMode(source, options = {}) {
            const root = source === window
                ? document.querySelector('main, article') || document.body
                : source;
            if (!root || !root.querySelectorAll) return false;

            if (!this.tldrSessions) this.tldrSessions = new Map();
            if (this.activeTldrSource && this.activeTldrSource !== source) {
                this.restoreRapidSkimMode(this.activeTldrSource, 'source-changed');
            }

            let session = this.tldrSessions.get(source);
            if (!session) {
                session = {
                    active: true,
                    source,
                    root,
                    entries: new Map(),
                    automatic: Boolean(options.automatic),
                    observer: null,
                    observerTimer: null
                };
                this.tldrSessions.set(source, session);
            }
            session.active = true;
            session.automatic = Boolean(options.automatic);
            this.activeTldrSource = source;

            this.preserveTldrScrollPosition(source, () => this.processTldrCandidates(session));
            if (session.entries.size === 0) {
                this.tldrSessions.delete(source);
                this.activeTldrSource = null;
                this.ui.showScrollToast('Compact view found no eligible long paragraphs here.');
                return false;
            }

            this.observeTldrDynamicContent(session);
            this.showTldrToolbar(session);
            this.api.log('tldr_mode_applied', {
                source_type: source === window ? 'window' : 'container',
                paragraph_count: session.entries.size,
                mode: session.automatic ? 'automatic' : 'confirmed'
            });
            return true;
        }

        processTldrCandidates(session) {
            if (!session?.active) return 0;
            const remaining = Math.max(0, CONFIG.tldrMaxParagraphs - session.entries.size);
            if (remaining === 0) return 0;
            const candidates = this.getTldrCandidates(session.root)
                .filter(paragraph => !session.entries.has(paragraph))
                .slice(0, remaining);
            candidates.forEach(paragraph => this.prepareTldrParagraph(paragraph, session));
            return candidates.length;
        }

        getTldrCandidates(root) {
            if (!root?.querySelectorAll) return [];
            const candidates = Array.from(root.querySelectorAll('p')).filter(paragraph => {
                const text = String(paragraph.innerText || paragraph.textContent || '').replace(/\s+/g, ' ').trim();
                if (text.length < CONFIG.tldrMinParagraphChars) return false;
                if (this.isAdaptiveWebElement(paragraph) || paragraph.dataset?.awTldrPrepared === 'true') return false;
                if (paragraph.closest?.('form, nav, table, details, [role="alert"], [aria-live], [contenteditable="true"]')) return false;
                if (paragraph.matches?.('.lead, .intro, .summary, [data-no-tldr]')) return false;
                if (/^(warning|important|conclusion|key takeaway|summary)\b/i.test(text)) return false;
                const interactiveCount = paragraph.querySelectorAll?.('a, button, input, select, textarea').length || 0;
                return interactiveCount <= 2;
            });
            return candidates.length > 2 ? candidates.slice(1) : candidates;
        }

        selectTldrKeySentence(text) {
            const normalized = String(text || '').replace(/\s+/g, ' ').trim();
            const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
            if (sentences.length === 0) return normalized.slice(0, 240);
            let best = sentences[0].trim();
            let bestScore = -Infinity;
            sentences.slice(0, 12).forEach((rawSentence, index) => {
                const sentence = rawSentence.trim();
                const length = sentence.length;
                let score = -index * 0.2;
                if (length >= 70 && length <= 220) score += 4;
                else if (length >= 45 && length <= 260) score += 2;
                if (/\b(because|therefore|means|allows|helps|ensures|important|key|result|provides)\b/i.test(sentence)) score += 2;
                if (/\d|%/.test(sentence)) score += 0.5;
                if (/\b(click|scroll|instruction|try|demo)\b/i.test(sentence)) score -= 2;
                if (score > bestScore) {
                    best = sentence;
                    bestScore = score;
                }
            });
            return best.slice(0, 260);
        }

        prepareTldrParagraph(paragraph, session) {
            if (!paragraph || session.entries.has(paragraph)) return null;
            const originalId = paragraph.id || '';
            if (!paragraph.id) {
                this.tldrParagraphId = (this.tldrParagraphId || 0) + 1;
                paragraph.id = `aw-tldr-paragraph-${this.tldrParagraphId}`;
            }
            paragraph.dataset.awTldrPrepared = 'true';

            const preview = document.createElement('p');
            preview.className = 'aw-tldr-preview';
            preview.setAttribute('data-aw-tldr-for', paragraph.id);
            const label = document.createElement('span');
            label.className = 'aw-tldr-preview-label';
            label.textContent = 'Key point';
            const previewText = document.createElement('span');
            previewText.textContent = this.selectTldrKeySentence(paragraph.innerText || paragraph.textContent || '');
            preview.append(label, previewText);

            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'aw-tldr-read-more';
            toggle.setAttribute('aria-controls', paragraph.id);

            const entry = { paragraph, preview, toggle, originalId, expanded: false };
            toggle.addEventListener('click', () => this.setTldrEntryExpanded(entry, !entry.expanded));
            paragraph.insertAdjacentElement('beforebegin', preview);
            paragraph.insertAdjacentElement('afterend', toggle);
            session.entries.set(paragraph, entry);
            this.setTldrEntryExpanded(entry, false);
            return entry;
        }

        setTldrEntryExpanded(entry, expanded) {
            if (!entry) return;
            entry.expanded = Boolean(expanded);
            if (entry.expanded) {
                entry.paragraph.classList.remove('aw-tldr-collapsed', 'aw-tldr-original-hidden');
                entry.paragraph.removeAttribute('aria-hidden');
                entry.preview.hidden = true;
                entry.toggle.textContent = 'Show key point';
            } else {
                entry.paragraph.classList.add('aw-tldr-collapsed', 'aw-tldr-original-hidden');
                entry.paragraph.setAttribute('aria-hidden', 'true');
                entry.preview.hidden = false;
                entry.toggle.textContent = 'Read full paragraph';
            }
            entry.toggle.setAttribute('aria-expanded', String(entry.expanded));
        }

        setAllTldrEntries(source, expanded) {
            const session = this.tldrSessions?.get(source);
            if (!session) return;
            this.preserveTldrScrollPosition(source, () => {
                session.entries.forEach(entry => this.setTldrEntryExpanded(entry, expanded));
            });
            this.api.log(expanded ? 'tldr_expand_all' : 'tldr_collapse_all', {
                paragraph_count: session.entries.size
            });
        }

        restoreTldrEntry(entry) {
            if (!entry) return;
            entry.paragraph.classList.remove('aw-tldr-collapsed', 'aw-tldr-original-hidden');
            entry.paragraph.removeAttribute('aria-hidden');
            if (entry.paragraph.dataset) delete entry.paragraph.dataset.awTldrPrepared;
            if (!entry.originalId) entry.paragraph.removeAttribute('id');
            entry.preview.remove();
            entry.toggle.remove();
        }

        restoreRapidSkimMode(source, reason = 'exit') {
            const session = this.tldrSessions?.get(source);
            if (!session) return false;
            session.active = false;
            session.observer?.disconnect();
            if (session.observerTimer) clearTimeout(session.observerTimer);
            this.preserveTldrScrollPosition(source, () => {
                session.entries.forEach(entry => this.restoreTldrEntry(entry));
            });
            session.entries.clear();
            this.tldrSessions.delete(source);
            if (this.activeTldrSource === source) this.activeTldrSource = null;
            this.ui.removeTldrToolbar();
            this.api.log('tldr_mode_restored', { reason });
            return true;
        }

        showTldrToolbar(session) {
            const preference = this.getTldrPreference();
            this.ui.showTldrToolbar({
                count: session.entries.size,
                sourceLabel: session.source === window ? 'Page' : 'Section',
                preference,
                onExpandAll: () => this.setAllTldrEntries(session.source, true),
                onCollapseAll: () => this.setAllTldrEntries(session.source, false),
                onPreference: mode => {
                    this.setTldrPreference(mode);
                    session.automatic = mode === 'auto';
                    this.showTldrToolbar(session);
                },
                onDisable: () => {
                    this.setTldrPreference('off');
                    this.restoreRapidSkimMode(session.source, 'disabled-for-tab');
                    this.ui.showScrollToast('Compact reading is disabled for this site in this tab.');
                },
                onExit: () => this.restoreRapidSkimMode(session.source, 'user-exit')
            });
        }

        observeTldrDynamicContent(session) {
            if (session.observer || typeof MutationObserver !== 'function') return;
            session.observer = new MutationObserver(mutations => {
                const hasNewContent = mutations.some(mutation => Array.from(mutation.addedNodes || []).some(node =>
                    node.nodeType === 1 && (node.matches?.('p') || node.querySelector?.('p'))
                ));
                if (!hasNewContent) return;
                if (session.observerTimer) clearTimeout(session.observerTimer);
                session.observerTimer = setTimeout(() => {
                    if (!session.active) return;
                    this.preserveTldrScrollPosition(session.source, () => this.processTldrCandidates(session));
                    this.showTldrToolbar(session);
                }, CONFIG.tldrDynamicContentDelay);
            });
            session.observer.observe(session.root, { childList: true, subtree: true });
        }

        preserveTldrScrollPosition(source, mutate) {
            if (typeof mutate !== 'function') return;
            let before;
            try {
                before = this.getScrollMetrics(source);
            } catch (error) {
                before = null;
            }
            mutate();
            if (!before || before.range <= 0) return;
            let after;
            try {
                after = this.getScrollMetrics(source);
            } catch (error) {
                return;
            }
            const targetPosition = before.depth * after.range;
            if (!Number.isFinite(targetPosition) || Math.abs(targetPosition - after.position) < 4) return;
            this.scrollProgrammaticUntil = Date.now() + 300;
            if (source === window && typeof window.scrollTo === 'function') {
                window.scrollTo(0, targetPosition);
            } else if (source && typeof source.scrollTop === 'number') {
                source.scrollTop = targetPosition;
            }
        }

        scrollSourceToStart(source) {
            this.scrollProgrammaticUntil = Date.now() + 1800;
            if (source === window) window.scrollTo({ top: 0, behavior: 'smooth' });
            else source.scrollTo({ top: 0, behavior: 'smooth' });
        }

        getScrollSummaryCount() {
            try {
                return Number(sessionStorage.getItem('aw-scroll-summary-count') || 0);
            } catch (error) {
                return 0;
            }
        }

        setScrollSummaryCount(count) {
            try {
                sessionStorage.setItem('aw-scroll-summary-count', String(count));
            } catch (error) {
                if (CONFIG.debug) console.debug('AdaptiveWeb scroll summary count could not be saved', error);
            }
        }

        async onSkimmerDetected() {
            // Kept as a compatibility entry point for older integrations.
            const metrics = this.getScrollMetrics(window);
            const tracker = this.scrollTrackers.get(window) || this.createScrollTracker(metrics);
            this.onRapidSkimDetected(window, tracker);

            return null;
        }

        checkEngaged(now, speed, scrollY) {
            if (this.engagedTriggered) return;
            // Check Depth
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const depth = scrollY / docHeight;

            if (depth > CONFIG.engagedMinDepth && speed < CONFIG.engagedScrollMaxSpeed && speed > 0) {
                // We are deep and scrolling slowly.
                // Simplified "Hover" check: Assume if scrolling slow deep, they are engaged.
                // Real hover check is expensive on all elements.

                // Debounce
                if (!this.engagedTimer) {
                    this.engagedTimer = setTimeout(() => {
                        this.onEngagedReader();
                    }, CONFIG.engagedHoverTime);
                }
            } else {
                if (this.engagedTimer) {
                    clearTimeout(this.engagedTimer);
                    this.engagedTimer = null;
                }
            }
        }

        async onEngagedReader() {
            this.engagedTriggered = true;
            if (CONFIG.debug) console.log('Detected: Engaged Reader');
            this.api.log('engaged_reader');

            // Real-time: Scrape the current page for "Related" or interesting links
            const relatedLinks = this.scrapeRelatedLinks();

            if (relatedLinks.length > 0) {
                this.ui.showSidebar(relatedLinks);
            } else {
                // Fallback to API if we can't find anything nice
                const related = await this.api.getRelated(window.location.href);
                if (related) {
                    this.ui.showSidebar(related.articles);
                }
            }
        }

        scrapeRelatedLinks() {
            // Heuristic: Find links in <aside>, or links with images, or just reasonable links
            const links = [];
            const candidates = document.querySelectorAll('aside a, .sidebar a, .related a, article a');

            for (let a of candidates) {
                if (links.length >= 5) break;

                // Filter nice links
                const title = a.innerText.trim();
                if (title.length > 15 && a.href && !a.href.includes('#')) {
                    // Try to find an image nearby
                    let img = a.querySelector('img');
                    if (!img) {
                        // Look at parent
                        const parent = a.parentElement;
                        if (parent) img = parent.querySelector('img');
                    }

                    links.push({
                        title: title,
                        url: a.href,
                        image: img ? img.src : 'https://placehold.co/100x100?text=News' // Fallback
                    });
                }
            }

            // Dedup
            return links.filter((v, i, a) => a.findIndex(v2 => (v2.url === v.url)) === i);
        }

        // --- Feature 4: Advanced Cursor Hesitation Assistant ---
        initCursorHesitation() {
            if (this.cursorHesitationInitialized) return;
            this.cursorHesitationInitialized = true;

            const now = performance.now();
            this.cursorTargetIds = new WeakMap();
            this.cursorTargetsById = new Map();
            this.cursorTargetIdCounter = 0;
            this.cursorTracker = {
                state: 'observing',
                samples: [],
                transitions: [],
                retreats: [],
                deadClicks: [],
                formEvents: [],
                lastSampleAt: 0,
                lastSignificantMoveAt: now,
                lastInputAt: 0,
                lastTarget: null,
                lastCoords: null,
                suspectedAt: 0,
                suspectedPattern: null,
                cooldownUntil: 0,
                mutationVersion: 0,
                baselineSpeed: this.loadCursorBaseline(),
                baselineSamples: 0
            };

            this.cursorMutationObserver = new MutationObserver(() => {
                this.cursorTracker.mutationVersion += 1;
            });
            this.cursorMutationObserver.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true
            });

            document.addEventListener('pointermove', (event) => this.trackCursorSample(event), { passive: true });
            document.addEventListener('pointerout', (event) => this.trackTargetRetreat(event), { passive: true });
            document.addEventListener('click', (event) => this.trackPossibleDeadClick(event), true);
            document.addEventListener('focusin', (event) => this.trackFormInteraction(event, 'focus'), true);
            document.addEventListener('focusout', (event) => this.trackFormInteraction(event, 'blur'), true);
            document.addEventListener('invalid', (event) => this.trackFormInteraction(event, 'invalid'), true);
            document.addEventListener('input', () => {
                this.cursorTracker.lastInputAt = performance.now();
            }, true);
            document.addEventListener('keydown', () => {
                this.cursorTracker.lastInputAt = performance.now();
            }, true);

            this.cursorAnalysisTimer = setInterval(
                () => this.analyzeCursorHesitation(),
                CONFIG.cursorAnalysisInterval
            );

            window.addEventListener('pagehide', () => {
                clearInterval(this.cursorAnalysisTimer);
                if (this.cursorMutationObserver) this.cursorMutationObserver.disconnect();
            }, { once: true });
        }

        trackCursorSample(event) {
            if (event.pointerType && event.pointerType !== 'mouse') return;
            if (this.isAdaptiveWebElement(event.target)) return;

            const now = performance.now();
            const tracker = this.cursorTracker;
            if (now - tracker.lastSampleAt < CONFIG.cursorSampleInterval) return;

            const target = this.getCursorContextTarget(event.target);
            const targetId = target ? this.getCursorTargetId(target) : null;
            const previous = tracker.samples[tracker.samples.length - 1];
            const sample = {
                x: event.clientX,
                y: event.clientY,
                time: now,
                target,
                targetId,
                targetType: this.getCursorTargetType(target)
            };

            if (previous) {
                const distance = Math.hypot(sample.x - previous.x, sample.y - previous.y);
                const elapsed = Math.max((now - previous.time) / 1000, 0.001);
                const speed = distance / elapsed;

                if (distance > 4) tracker.lastSignificantMoveAt = now;
                this.updateCursorBaseline(speed);

                if (targetId && previous.targetId && targetId !== previous.targetId) {
                    tracker.transitions.push({ from: previous.targetId, to: targetId, time: now });
                }
            } else {
                tracker.lastSignificantMoveAt = now;
            }

            tracker.samples.push(sample);
            tracker.lastSampleAt = now;
            tracker.lastTarget = target;
            tracker.lastCoords = { x: sample.x, y: sample.y };
            this.pruneCursorHistory(now);
        }

        trackTargetRetreat(event) {
            if (this.isAdaptiveWebElement(event.target)) return;
            const target = this.getMeaningfulInteractiveTarget(event.target);
            if (!target || target.contains(event.relatedTarget)) return;

            const now = performance.now();
            this.cursorTracker.retreats.push({
                targetId: this.getCursorTargetId(target),
                time: now
            });
            this.pruneCursorHistory(now);
        }

        trackPossibleDeadClick(event) {
            if (this.isAdaptiveWebElement(event.target)) return;
            const target = this.getMeaningfulInteractiveTarget(event.target);
            if (!target) return;

            const style = window.getComputedStyle(target);
            if (!this.isInteractiveTarget(target) && style.cursor !== 'pointer') return;

            const tracker = this.cursorTracker;
            const targetId = this.getCursorTargetId(target);
            const mutationVersion = tracker.mutationVersion;
            const locationBefore = window.location.href;

            setTimeout(() => {
                if (window.location.href !== locationBefore) return;
                if (tracker.mutationVersion !== mutationVersion) return;

                const now = performance.now();
                tracker.deadClicks.push({ targetId, time: now });
                this.pruneCursorHistory(now);
            }, 450);
        }

        trackFormInteraction(event, type) {
            const field = event.target && event.target.closest
                ? event.target.closest('input, select, textarea, [contenteditable="true"]')
                : null;
            if (!field || this.isAdaptiveWebElement(field)) return;

            const now = performance.now();
            this.cursorTracker.formEvents.push({
                type,
                targetId: this.getCursorTargetId(field),
                invalid: type === 'invalid' ||
                    field.getAttribute('aria-invalid') === 'true' ||
                    (field.matches(':invalid') && field.value !== ''),
                time: now
            });
            this.pruneCursorHistory(now);
        }

        analyzeCursorHesitation() {
            const tracker = this.cursorTracker;
            const now = performance.now();
            if (!tracker || tracker.samples.length === 0) return;
            if (this.shouldSuppressCursorHelp(now)) {
                this.resetCursorSuspicion();
                return;
            }

            this.pruneCursorHistory(now);
            if (tracker.samples.length === 0) {
                this.resetCursorSuspicion();
                return;
            }
            const analysis = this.calculateCursorHesitation(now);

            if (!analysis || analysis.confidence < CONFIG.cursorSuspectScore) {
                this.resetCursorSuspicion();
                return;
            }

            if (tracker.state === 'observing' || tracker.suspectedPattern !== analysis.pattern) {
                tracker.state = 'suspected';
                tracker.suspectedAt = now;
                tracker.suspectedPattern = analysis.pattern;
                return;
            }

            if (
                tracker.state === 'suspected' &&
                analysis.confidence >= CONFIG.cursorConfirmScore &&
                now - tracker.suspectedAt >= CONFIG.cursorConfirmationTime
            ) {
                this.onCursorHesitation(analysis);
            }
        }

        calculateCursorHesitation(now) {
            const tracker = this.cursorTracker;
            const samples = tracker.samples;
            if (!samples || samples.length === 0) return null;
            const first = samples[0];
            const last = samples[samples.length - 1];
            const target = last.target || tracker.lastTarget;
            const targetId = target ? this.getCursorTargetId(target) : null;
            const targetType = this.getCursorTargetType(target);
            const interactive = this.isInteractiveTarget(target);
            const durationMs = Math.max(now - first.time, now - tracker.lastSignificantMoveAt);

            let pathLength = 0;
            let absoluteTurn = 0;
            let signedTurn = 0;
            let directionChanges = 0;

            for (let index = 1; index < samples.length; index += 1) {
                pathLength += Math.hypot(
                    samples[index].x - samples[index - 1].x,
                    samples[index].y - samples[index - 1].y
                );
            }

            for (let index = 2; index < samples.length; index += 1) {
                const firstAngle = Math.atan2(
                    samples[index - 1].y - samples[index - 2].y,
                    samples[index - 1].x - samples[index - 2].x
                );
                const secondAngle = Math.atan2(
                    samples[index].y - samples[index - 1].y,
                    samples[index].x - samples[index - 1].x
                );
                let delta = secondAngle - firstAngle;
                while (delta > Math.PI) delta -= Math.PI * 2;
                while (delta < -Math.PI) delta += Math.PI * 2;
                absoluteTurn += Math.abs(delta);
                signedTurn += delta;
                if (Math.abs(delta) > 1.05) directionChanges += 1;
            }

            const netDistance = Math.hypot(last.x - first.x, last.y - first.y);
            const pathEfficiency = pathLength > 0 ? netDistance / pathLength : 1;
            const turnConsistency = absoluteTurn > 0 ? Math.abs(signedTurn) / absoluteTurn : 0;
            const stationaryDuration = now - tracker.lastSignificantMoveAt;
            const adaptiveStationaryTime = Math.max(
                1300,
                Math.min(2300, CONFIG.cursorStationaryTime + 500 - tracker.baselineSpeed * 0.8)
            );

            const recentTransitions = tracker.transitions.filter(item => now - item.time <= 4500);
            const targetSwitches = recentTransitions.length;
            const alternatingChoices = this.hasAlternatingTargets(recentTransitions);
            const retreatCount = tracker.retreats.filter(item =>
                now - item.time <= 5000 && (!targetId || item.targetId === targetId)
            ).length;
            const deadClickCount = tracker.deadClicks.filter(item =>
                now - item.time <= 5000 && (!targetId || item.targetId === targetId)
            ).length;
            const recentFormEvents = tracker.formEvents.filter(item => now - item.time <= 8000);
            const invalidFormEvents = recentFormEvents.filter(item => item.invalid).length;
            const fieldSwitches = recentFormEvents.filter(item => item.type === 'blur').length;
            const candidates = [];

            if (interactive && stationaryDuration >= adaptiveStationaryTime) {
                candidates.push({
                    pattern: 'stationary_near_action',
                    confidence: Math.min(0.88, 0.72 + (stationaryDuration - adaptiveStationaryTime) / 8000)
                });
            }

            if (pathLength >= 150 && pathEfficiency < 0.42 && absoluteTurn >= 5.2 && turnConsistency >= 0.55) {
                candidates.push({
                    pattern: 'circular_searching',
                    confidence: Math.min(0.94, 0.76 + absoluteTurn / 50 + (0.42 - pathEfficiency) * 0.2)
                });
            }

            if (pathLength >= 120 && pathEfficiency < 0.6 && directionChanges >= 4 && turnConsistency < 0.6) {
                candidates.push({
                    pattern: 'zigzag_uncertainty',
                    confidence: Math.min(0.9, 0.7 + directionChanges * 0.025 + (0.6 - pathEfficiency) * 0.1)
                });
            }

            if (alternatingChoices || (targetSwitches >= 4 && this.countRecentTargetTypes(samples) <= 3)) {
                candidates.push({
                    pattern: 'choice_oscillation',
                    confidence: Math.min(0.96, 0.8 + targetSwitches * 0.025)
                });
            }

            if (retreatCount >= 3) {
                candidates.push({
                    pattern: 'approach_and_retreat',
                    confidence: Math.min(0.92, 0.73 + retreatCount * 0.04)
                });
            }

            if (deadClickCount >= 2) {
                candidates.push({
                    pattern: 'repeated_dead_click',
                    confidence: Math.min(0.98, 0.88 + deadClickCount * 0.03)
                });
            }

            if (invalidFormEvents > 0 || fieldSwitches >= 3) {
                candidates.push({
                    pattern: 'form_difficulty',
                    confidence: Math.min(0.97, 0.84 + invalidFormEvents * 0.06 + fieldSwitches * 0.015)
                });
            }

            if (candidates.length === 0) return null;
            candidates.sort((a, b) => b.confidence - a.confidence);
            const winner = candidates[0];

            return {
                pattern: winner.pattern,
                confidence: Number(winner.confidence.toFixed(2)),
                durationMs: Math.round(durationMs),
                target,
                targetId,
                targetType,
                targetLabel: this.getCursorTargetLabel(target),
                coords: tracker.lastCoords,
                pathEfficiency: Number(pathEfficiency.toFixed(2)),
                directionChanges,
                targetSwitches,
                retreatCount,
                deadClickCount,
                invalidFormEvents
            };
        }

        onCursorHesitation(analysis) {
            const tracker = this.cursorTracker;
            if (tracker.state === 'assisting') return;

            const promptCount = this.getCursorPromptCount();
            tracker.state = 'assisting';
            tracker.cooldownUntil = performance.now() + CONFIG.cursorCooldown;
            this.setCursorPromptCount(promptCount + 1);

            if (CONFIG.debug) {
                console.log('Detected: Advanced Cursor Hesitation', {
                    pattern: analysis.pattern,
                    confidence: analysis.confidence,
                    targetType: analysis.targetType
                });
            }

            this.api.log('hesitation', this.getCursorAnalyticsMetadata(analysis, {
                outcome: 'prompted',
                promptNumber: promptCount + 1
            }));

            const shown = this.ui.showSuggestion(analysis, {
                onSuggest: () => {
                    this.finishCursorAssistance('accepted_ai', analysis, CONFIG.cursorCooldown);
                    this.onManualHelp(analysis);
                },
                onLocal: () => {
                    this.finishCursorAssistance('accepted_local', analysis, CONFIG.cursorCooldown);
                    this.onLocalCursorHelp(analysis);
                },
                onDismiss: (reason) => {
                    const cooldown = reason === 'timeout' ? CONFIG.cursorCooldown : CONFIG.cursorDismissCooldown;
                    this.finishCursorAssistance(reason === 'timeout' ? 'ignored' : 'dismissed', analysis, cooldown);
                }
            });

            if (!shown) this.finishCursorAssistance('suppressed', analysis, CONFIG.cursorCooldown);
        }

        finishCursorAssistance(outcome, analysis, cooldown) {
            const tracker = this.cursorTracker;
            tracker.state = 'cooldown';
            tracker.cooldownUntil = performance.now() + cooldown;
            tracker.suspectedAt = 0;
            tracker.suspectedPattern = null;

            this.api.log(`help_${outcome}`, this.getCursorAnalyticsMetadata(analysis, { outcome }));

            setTimeout(() => {
                if (tracker.state === 'cooldown' && performance.now() >= tracker.cooldownUntil) {
                    tracker.state = 'observing';
                }
            }, cooldown + 50);
        }

        async onManualHelp(analysis) {
            if (CONFIG.debug) console.log('User accepted contextual AI help');
            const text = this.buildCursorHelpContext(analysis);

            this.ui.showSummary('Analyzing the nearby controls with Gemini...', true);

            const res = await this.api.suggest(text);

            if (res && (Array.isArray(res.actions) || Array.isArray(res.suggestions))) {
                const actions = Array.isArray(res.actions) ? res.actions : res.suggestions;
                const source = String(res.method || '').startsWith('gemini') ? 'ai' : 'fallback';
                this.renderCursorAssistance({
                    summary: res.summary,
                    actions
                }, analysis, source);
                return;
            }

            this.renderCursorAssistance(
                this.buildLocalAssistance(analysis, true),
                analysis,
                'fallback'
            );
        }

        onLocalCursorHelp(analysis) {
            const target = analysis.target;
            if (!target || !target.isConnected) {
                this.ui.showSummary('The original page control is no longer available.');
                return;
            }

            this.ui.highlightAssistedTarget(target);
            this.ui.showSummary('Inspecting this part of the page locally...');
            this.renderCursorAssistance(this.buildLocalAssistance(analysis), analysis, 'local');
        }

        renderCursorAssistance(result, analysis, source) {
            if (!this.ui.currentSummaryBox || !this.ui.currentSummaryBox.isConnected) {
                this.ui.showSummary(result.summary || 'Here are some options.');
            }

            const sourceLabels = {
                ai: 'Gemini suggestions',
                fallback: 'Local fallback',
                local: 'On-device guidance'
            };
            this.ui.updateSummaryContent(result.summary, result.actions || [], {
                source,
                sourceLabel: sourceLabels[source] || 'Adaptive guidance',
                onAction: (action) => this.handleSuggestedAction(action, analysis, source),
                onFeedback: (helpful) => this.recordCursorHelpFeedback(helpful, source, analysis)
            });
        }

        buildLocalAssistance(analysis, apiUnavailable = false) {
            if (analysis.targetType === 'form_field' || analysis.pattern === 'form_difficulty') {
                return this.buildFormAssistance(analysis, apiUnavailable);
            }
            if (analysis.pattern === 'choice_oscillation' || analysis.targetType === 'choice') {
                return this.buildChoiceAssistance(analysis, apiUnavailable);
            }
            if (analysis.pattern === 'repeated_dead_click') {
                return this.buildDeadClickAssistance(analysis, apiUnavailable);
            }
            return this.buildGenericLocalAssistance(analysis, apiUnavailable);
        }

        buildFormAssistance(analysis, apiUnavailable = false) {
            const target = analysis.target;
            const form = target && target.closest ? target.closest('form') : null;
            const issues = this.getFormFieldIssues(form);
            const prefix = apiUnavailable ? 'AI is unavailable, but the form was checked locally. ' : '';
            const actions = issues.slice(0, 3).map((issue, index) => ({
                id: `form-issue-${index + 1}`,
                label: `Go to ${issue.label}`,
                description: issue.reason,
                actionType: 'focus',
                targetId: issue.targetId,
                confidence: 1,
                requiresConfirmation: false
            }));

            if (actions.length > 0) {
                return {
                    summary: `${prefix}${issues.length} field${issues.length === 1 ? ' needs' : 's need'} attention before you continue.`,
                    actions
                };
            }

            const submit = form && form.querySelector
                ? form.querySelector('button[type="submit"], input[type="submit"], button:not([type])')
                : null;
            if (submit && (submit.disabled || submit.getAttribute('aria-disabled') === 'true')) {
                return {
                    summary: `${prefix}The required fields look complete, but the submit control is currently disabled.`,
                    actions: [this.createLocalAction(submit, 'Inspect the disabled submit control', 'Check whether the page requires another choice or confirmation.', 'highlight')]
                };
            }

            return {
                summary: `${prefix}No missing required fields were found. The selected field is ready for input.`,
                actions: target ? [this.createLocalAction(target, 'Continue with this field', 'Focus the field without entering or submitting any data.', 'focus')] : []
            };
        }

        buildChoiceAssistance(analysis, apiUnavailable = false) {
            const descriptors = this.getNearbyActionDescriptors(analysis.target)
                .filter(item => ['choice', 'button', 'link'].includes(item.type))
                .slice(0, 4);
            const prefix = apiUnavailable ? 'AI is unavailable, so these options were compared locally. ' : '';
            return {
                summary: descriptors.length > 1
                    ? `${prefix}You were moving between ${descriptors.length} nearby choices. Their current states are shown below.`
                    : `${prefix}Only one nearby choice could be identified.`,
                actions: descriptors.map((item, index) => ({
                    id: `choice-${index + 1}`,
                    label: item.label,
                    description: item.stateSummary,
                    actionType: item.type === 'form_field' ? 'focus' : 'highlight',
                    targetId: item.targetId,
                    confidence: 1,
                    requiresConfirmation: false
                }))
            };
        }

        buildDeadClickAssistance(analysis, apiUnavailable = false) {
            const diagnosis = this.diagnoseDeadClickTarget(analysis.target);
            const prefix = apiUnavailable ? 'AI is unavailable. ' : '';
            const actions = [];
            if (diagnosis.relatedTarget) {
                actions.push(this.createLocalAction(
                    diagnosis.relatedTarget,
                    diagnosis.relatedLabel || 'Go to the required field',
                    diagnosis.relatedReason || 'Complete this prerequisite before trying the control again.',
                    'focus'
                ));
            }
            if (analysis.target) {
                actions.push(this.createLocalAction(
                    analysis.target,
                    'Inspect the unresponsive control',
                    'Highlight the exact control that did not produce a visible page change.',
                    'highlight'
                ));
            }
            return {
                summary: `${prefix}${diagnosis.message}`,
                actions: actions.slice(0, 3)
            };
        }

        buildGenericLocalAssistance(analysis, apiUnavailable = false) {
            const descriptors = this.getNearbyActionDescriptors(analysis.target).slice(0, 3);
            const prefix = apiUnavailable ? 'AI is unavailable, so nearby controls were inspected locally. ' : '';
            return {
                summary: `${prefix}${this.getCursorPatternDescription(analysis.pattern, analysis.targetLabel)}`,
                actions: descriptors.map((item, index) => ({
                    id: `nearby-${index + 1}`,
                    label: `Show ${item.label}`,
                    description: item.stateSummary,
                    actionType: item.type === 'form_field' ? 'focus' : 'highlight',
                    targetId: item.targetId,
                    confidence: 1,
                    requiresConfirmation: false
                }))
            };
        }

        createLocalAction(target, label, description, actionType = 'highlight') {
            return {
                id: `local-${this.getCursorTargetId(target) || Date.now()}`,
                label,
                description,
                actionType,
                targetId: this.getCursorTargetId(target),
                confidence: 1,
                requiresConfirmation: false
            };
        }

        handleSuggestedAction(action, analysis, source) {
            const normalized = typeof action === 'string'
                ? { label: action, actionType: 'highlight', targetId: null }
                : action || {};
            const target = this.resolveCursorTarget(normalized.targetId) || analysis.target;
            const actionType = ['highlight', 'focus', 'compare', 'activate'].includes(normalized.actionType)
                ? normalized.actionType
                : 'highlight';

            if (!target || !target.isConnected) {
                this.ui.setAssistanceStatus('That page control is no longer available. The page may have changed.', 'warning');
                return;
            }

            if (actionType === 'compare') {
                this.renderCursorAssistance(this.buildChoiceAssistance({ ...analysis, target }), analysis, 'local');
                return;
            }

            this.ui.highlightAssistedTarget(target);
            if (actionType === 'focus') {
                if (typeof target.focus === 'function') target.focus({ preventScroll: false });
                this.ui.setAssistanceStatus('The relevant field is focused. No value was entered.', 'success');
                this.api.log('cursor_action_guided', this.getCursorAnalyticsMetadata(analysis, {
                    source,
                    action_type: 'focus'
                }));
                return;
            }

            if (actionType !== 'activate') {
                this.ui.setAssistanceStatus('The relevant control is highlighted. You remain in control of the next step.', 'success');
                this.api.log('cursor_action_guided', this.getCursorAnalyticsMetadata(analysis, {
                    source,
                    action_type: 'highlight'
                }));
                return;
            }

            const activation = this.getSafeActivationPolicy(target);
            if (!activation.allowed) {
                this.ui.setAssistanceStatus(`${activation.reason} The control was highlighted but not activated.`, 'warning');
                return;
            }

            this.ui.showActionConfirmation(normalized, () => {
                const latestPolicy = this.getSafeActivationPolicy(target);
                if (!target.isConnected || !latestPolicy.allowed) {
                    this.ui.setAssistanceStatus('The control changed and can no longer be safely activated.', 'warning');
                    return;
                }
                target.click();
                this.api.log('cursor_action_executed', this.getCursorAnalyticsMetadata(analysis, {
                    source,
                    action_type: 'activate'
                }));
            });
        }

        resolveCursorTarget(targetId) {
            if (!targetId || !this.cursorTargetsById) return null;
            const target = this.cursorTargetsById.get(targetId);
            if (target && target.isConnected) return target;
            this.cursorTargetsById.delete(targetId);
            return null;
        }

        recordCursorHelpFeedback(helpful, source, analysis) {
            const storageKey = 'aw-cursor-help-feedback-v1';
            try {
                const feedback = JSON.parse(localStorage.getItem(storageKey) || '{}');
                const key = `${source}:${analysis.pattern}`;
                const entry = feedback[key] || { helpful: 0, notHelpful: 0 };
                if (helpful) entry.helpful += 1;
                else entry.notHelpful += 1;
                feedback[key] = entry;
                localStorage.setItem(storageKey, JSON.stringify(feedback));
            } catch (error) {
                if (CONFIG.debug) console.debug('AdaptiveWeb feedback could not be saved', error);
            }
            this.api.log('cursor_help_feedback', this.getCursorAnalyticsMetadata(analysis, {
                source,
                helpful: Boolean(helpful)
            }));
        }

        buildCursorHelpContext(analysis) {
            const target = analysis.target;
            const container = target && target.closest
                ? target.closest('form, section, article, main, nav, aside') || target.parentElement
                : document.querySelector('main, article') || document.body;
            const nearbyText = this.redactSensitiveText((container && container.innerText) || '').slice(0, 1600);
            const availableActions = this.getNearbyActionDescriptors(target).slice(0, 8);
            const missingFields = this.getMissingFormFields(target && target.closest ? target.closest('form') : null);

            return JSON.stringify({
                schemaVersion: 2,
                page: {
                    domain: window.location.hostname,
                    title: this.redactSensitiveText(document.title).slice(0, 160)
                },
                behavior: {
                    pattern: analysis.pattern,
                    confidence: analysis.confidence,
                    focusedControlType: analysis.targetType,
                    focusedControlLabel: analysis.targetLabel || 'Unlabelled control'
                },
                availableActions: availableActions.map(item => ({
                    targetId: item.targetId,
                    label: item.label,
                    type: item.type,
                    state: item.stateSummary,
                    capabilities: item.capabilities
                })),
                missingRequiredFields: missingFields,
                nearbyContext: nearbyText
            });
        }

        getCursorPatternDescription(pattern, targetLabel = '') {
            const subject = targetLabel ? ` near “${targetLabel}”` : '';
            const descriptions = {
                stationary_near_action: `You paused${subject}. I can explain this control or suggest the next step.`,
                circular_searching: 'Your cursor movement suggests you may be searching for an action on this part of the page.',
                zigzag_uncertainty: 'You appear to be exploring several nearby controls. I can help narrow the choices.',
                choice_oscillation: 'You appear to be comparing multiple choices.',
                approach_and_retreat: `You returned to this control several times${subject}.`,
                repeated_dead_click: 'This control was clicked repeatedly without a visible result.',
                form_difficulty: 'This form appears to need attention before you can continue.'
            };
            return descriptions[pattern] || 'Would you like help with this part of the page?';
        }

        getCursorAnalyticsMetadata(analysis, extra = {}) {
            return {
                pattern: analysis.pattern,
                confidence: analysis.confidence,
                duration_ms: analysis.durationMs,
                target_type: analysis.targetType,
                path_efficiency: analysis.pathEfficiency,
                direction_changes: analysis.directionChanges,
                target_switches: analysis.targetSwitches,
                retreat_count: analysis.retreatCount,
                dead_click_count: analysis.deadClickCount,
                invalid_form_events: analysis.invalidFormEvents,
                ...extra
            };
        }

        shouldSuppressCursorHelp(now) {
            const tracker = this.cursorTracker;
            if (document.hidden || now < tracker.cooldownUntil) return true;
            if (tracker.state === 'assisting') return true;
            if (this.getCursorPromptCount() >= CONFIG.cursorPromptLimit) return true;
            if (document.querySelector('.aw-suggestion-bubble, .aw-modal-backdrop')) return true;
            if (document.querySelector('.aw-highlight, .aw-hover-light, .aw-hover-dark')) return true;
            if (window.getSelection && window.getSelection().toString().trim()) return true;
            if (now - tracker.lastInputAt < 1800) return true;

            const active = document.activeElement;
            if (active && active.isContentEditable && now - tracker.lastInputAt < 5000) return true;
            const activeMedia = Array.from(document.querySelectorAll('video, audio'))
                .some(media => !media.paused && !media.ended);
            if (activeMedia) return true;
            if (tracker.lastTarget && this.isAdaptiveWebElement(tracker.lastTarget)) return true;
            return false;
        }

        resetCursorSuspicion() {
            const tracker = this.cursorTracker;
            if (!tracker || tracker.state === 'assisting' || tracker.state === 'cooldown') return;
            tracker.state = 'observing';
            tracker.suspectedAt = 0;
            tracker.suspectedPattern = null;
        }

        pruneCursorHistory(now) {
            const tracker = this.cursorTracker;
            const sampleCutoff = now - CONFIG.cursorSampleWindow;
            tracker.samples = tracker.samples.filter(item => item.time >= sampleCutoff);
            tracker.transitions = tracker.transitions.filter(item => now - item.time <= 6000);
            tracker.retreats = tracker.retreats.filter(item => now - item.time <= 6000);
            tracker.deadClicks = tracker.deadClicks.filter(item => now - item.time <= 6000);
            tracker.formEvents = tracker.formEvents.filter(item => now - item.time <= 10000);
        }

        getCursorContextTarget(node) {
            return this.getMeaningfulInteractiveTarget(node) || (
                node && node.closest
                    ? node.closest('p, li, h1, h2, h3, h4, article, section')
                    : null
            );
        }

        getMeaningfulInteractiveTarget(node) {
            if (!node || !node.closest) return null;
            return node.closest([
                'button',
                'a[href]',
                'input:not([type="hidden"])',
                'select',
                'textarea',
                '[contenteditable="true"]',
                '[role="button"]',
                '[role="link"]',
                '[role="option"]',
                '[role="tab"]',
                '[role="checkbox"]',
                '[role="radio"]',
                'summary',
                '[tabindex]:not([tabindex="-1"])'
            ].join(','));
        }

        isInteractiveTarget(target) {
            return Boolean(target && this.getMeaningfulInteractiveTarget(target) === target);
        }

        isAdaptiveWebElement(target) {
            return Boolean(target && target.closest && target.closest([
                '.aw-suggestion-bubble',
                '.aw-summary-box',
                '.aw-scroll-toast',
                '.aw-tldr-prompt',
                '.aw-tldr-toolbar',
                '.aw-tldr-preview',
                '.aw-takeaways',
                '.aw-sidebar',
                '.aw-shortcuts-sidebar',
                '.aw-modal-backdrop',
                '.aw-summarize-btn',
                '.aw-simplify-btn',
                '.aw-tldr-read-more'
            ].join(',')));
        }

        getCursorTargetId(target) {
            if (!target) return null;
            if (!this.cursorTargetIds.has(target)) {
                this.cursorTargetIdCounter += 1;
                this.cursorTargetIds.set(target, `target-${this.cursorTargetIdCounter}`);
            }
            const targetId = this.cursorTargetIds.get(target);
            this.cursorTargetsById?.set(targetId, target);
            return targetId;
        }

        getCursorTargetType(target) {
            if (!target) return 'page_region';
            const tag = target.tagName ? target.tagName.toLowerCase() : '';
            const role = target.getAttribute ? target.getAttribute('role') : '';
            const inputType = tag === 'input' ? String(target.type || '').toLowerCase() : '';
            if (['checkbox', 'radio'].includes(inputType)) return 'choice';
            if (['input', 'select', 'textarea'].includes(tag) || target.isContentEditable) return 'form_field';
            if (tag === 'button' || role === 'button') return 'button';
            if (tag === 'a' || role === 'link') return 'link';
            if (['option', 'tab', 'checkbox', 'radio'].includes(role)) return 'choice';
            if (['p', 'li', 'article', 'section'].includes(tag)) return 'content';
            return 'interactive';
        }

        getCursorTargetLabel(target) {
            if (!target) return '';
            const labelledBy = target.getAttribute && target.getAttribute('aria-labelledby');
            const labelledText = labelledBy
                ? labelledBy.split(/\s+/).map(id => document.getElementById(id)?.innerText || '').join(' ')
                : '';
            const associatedLabel = target.labels && target.labels.length
                ? Array.from(target.labels).map(label => label.innerText || label.textContent || '').join(' ')
                : '';
            const raw = labelledText ||
                associatedLabel ||
                target.getAttribute?.('aria-label') ||
                target.getAttribute?.('placeholder') ||
                target.getAttribute?.('name') ||
                target.innerText ||
                '';
            return this.redactSensitiveText(String(raw).replace(/\s+/g, ' ').trim()).slice(0, 90);
        }

        getNearbyActionLabels(target) {
            return this.getNearbyActionDescriptors(target).map(item => item.label);
        }

        getNearbyActionDescriptors(target) {
            if (!target) return [];
            const container = target.closest?.('form, section, article, main, nav, aside') ||
                target.parentElement || document.body;
            const selector = [
                'button',
                'a[href]',
                'input:not([type="hidden"])',
                'select',
                'textarea',
                '[role="button"]',
                '[role="link"]',
                '[role="option"]',
                '[role="tab"]',
                '[role="checkbox"]',
                '[role="radio"]'
            ].join(',');
            const candidates = [target, ...Array.from(container.querySelectorAll?.(selector) || [])];
            const descriptors = [];
            const seen = new Set();

            for (const candidate of candidates) {
                if (!candidate || !candidate.isConnected || this.isAdaptiveWebElement(candidate)) continue;
                const targetId = this.getCursorTargetId(candidate);
                if (!targetId || seen.has(targetId)) continue;
                const label = this.getCursorTargetLabel(candidate);
                if (!label) continue;

                const disabled = Boolean(candidate.disabled) || candidate.getAttribute?.('aria-disabled') === 'true';
                const selected = Boolean(candidate.checked) ||
                    ['true', 'page', 'step'].includes(candidate.getAttribute?.('aria-selected')) ||
                    ['true', 'page', 'step'].includes(candidate.getAttribute?.('aria-current'));
                const state = [];
                if (selected) state.push('Currently selected');
                state.push(disabled ? 'Disabled' : 'Available');
                const description = this.redactSensitiveText(
                    candidate.getAttribute?.('aria-description') ||
                    candidate.getAttribute?.('title') ||
                    candidate.getAttribute?.('data-price') ||
                    ''
                ).slice(0, 100);
                if (description && description.toLowerCase() !== label.toLowerCase()) state.push(description);
                const localDetail = this.getComparableControlDetail(candidate, label);
                if (localDetail && localDetail.toLowerCase() !== description.toLowerCase()) state.push(localDetail);

                descriptors.push({
                    targetId,
                    label,
                    type: this.getCursorTargetType(candidate),
                    stateSummary: state.join(' · '),
                    capabilities: this.getActionCapabilities(candidate)
                });
                seen.add(targetId);
                if (descriptors.length >= 8) break;
            }
            return descriptors;
        }

        getComparableControlDetail(target, label) {
            if (!target || !target.closest) return '';
            const container = target.closest([
                'label',
                'li',
                'tr',
                '[role="option"]',
                '[role="radio"]',
                '.option',
                '.card',
                '.product'
            ].join(','));
            if (!container || container === target) return '';
            const text = this.redactSensitiveText(container.innerText || container.textContent || '')
                .replace(String(label || ''), '')
                .replace(/\s+/g, ' ')
                .trim();
            return text.length >= 3 ? text.slice(0, 120) : '';
        }

        getActionCapabilities(target) {
            const capabilities = ['highlight'];
            const targetType = this.getCursorTargetType(target);
            if (['form_field', 'choice', 'button', 'link'].includes(targetType)) capabilities.push('focus');
            if (targetType === 'choice') capabilities.push('compare');
            if (this.getSafeActivationPolicy(target).allowed) capabilities.push('activate');
            return capabilities;
        }

        getMissingFormFields(form) {
            return this.getFormFieldIssues(form).map(issue => issue.label).slice(0, 6);
        }

        getFormFieldIssues(form) {
            if (!form || !form.querySelectorAll) return [];
            const fields = Array.from(form.querySelectorAll([
                'input[required]',
                'select[required]',
                'textarea[required]',
                'input:invalid',
                'select:invalid',
                'textarea:invalid',
                '[aria-invalid="true"]'
            ].join(',')));
            const issues = [];

            for (const field of fields) {
                if (field.disabled || field.type === 'hidden') continue;
                const type = String(field.type || '').toLowerCase();
                const emptyChoice = ['checkbox', 'radio'].includes(type) && field.required && !field.checked;
                const emptyValue = field.required && !String(field.value || '').trim();
                const invalid = field.getAttribute?.('aria-invalid') === 'true' ||
                    (field.validity && field.validity.valid === false);
                if (!emptyChoice && !emptyValue && !invalid) continue;

                let reason = 'This field needs attention.';
                if (emptyChoice) reason = 'A required choice has not been selected.';
                else if (emptyValue) reason = 'This required field is empty.';
                else if (field.validationMessage) reason = this.redactSensitiveText(field.validationMessage).slice(0, 160);
                else if (invalid) reason = 'The current value does not match the expected format.';

                issues.push({
                    targetId: this.getCursorTargetId(field),
                    label: this.getCursorTargetLabel(field) || field.name || 'required field',
                    reason,
                    field
                });
                if (issues.length >= 6) break;
            }
            return issues;
        }

        diagnoseDeadClickTarget(target) {
            if (!target) return { message: 'The original control is no longer available.' };
            const label = this.getCursorTargetLabel(target) || 'This control';
            const form = target.closest?.('form');
            const issues = this.getFormFieldIssues(form);

            if (target.disabled || target.getAttribute?.('aria-disabled') === 'true') {
                return { message: `${label} is disabled. Another prerequisite may need to be completed first.`, relatedTarget: issues[0]?.field, relatedLabel: issues[0] ? `Go to ${issues[0].label}` : '', relatedReason: issues[0]?.reason };
            }
            if (target.getAttribute?.('aria-busy') === 'true' || /loading|pending|busy/i.test(String(target.className || ''))) {
                return { message: `${label} appears to be busy or loading. Wait for it to finish before trying again.` };
            }

            const style = window.getComputedStyle(target);
            if (style.pointerEvents === 'none') {
                return { message: `${label} is not currently accepting pointer input.` };
            }

            const rect = target.getBoundingClientRect?.();
            if (rect && rect.width > 0 && rect.height > 0 && document.elementFromPoint) {
                const topElement = document.elementFromPoint(
                    Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2)),
                    Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2))
                );
                if (topElement && topElement !== target && !target.contains(topElement) && !topElement.contains(target)) {
                    return { message: `${label} appears to be covered by another page element.` };
                }
            }

            const tag = target.tagName?.toLowerCase();
            const href = target.getAttribute?.('href');
            if (tag === 'a' && (!href || href === '#' || /^javascript:/i.test(href))) {
                return { message: `${label} does not currently point to a usable destination.` };
            }
            if (issues.length > 0) {
                return {
                    message: `${label} may be waiting for required form information.`,
                    relatedTarget: issues[0].field,
                    relatedLabel: `Go to ${issues[0].label}`,
                    relatedReason: issues[0].reason
                };
            }
            return { message: `${label} did not produce a visible page change. It may require another step or its page script may not have responded.` };
        }

        getSafeActivationPolicy(target) {
            if (!target || typeof target.click !== 'function') {
                return { allowed: false, reason: 'This page element cannot be safely activated.' };
            }
            if (target.disabled || target.getAttribute?.('aria-disabled') === 'true') {
                return { allowed: false, reason: 'This control is disabled.' };
            }

            const label = this.getCursorTargetLabel(target);
            if (this.isSensitiveActionLabel(label)) {
                return { allowed: false, reason: 'Sensitive or irreversible actions are never activated by AdaptiveWeb.' };
            }

            const tag = target.tagName?.toLowerCase();
            const role = target.getAttribute?.('role');
            const form = target.closest?.('form');
            if (form && form.querySelector?.('input[type="password"], [autocomplete^="cc-"]')) {
                return { allowed: false, reason: 'Controls in password or payment forms must be operated manually.' };
            }

            if (tag === 'a') {
                if (target.hasAttribute?.('download')) {
                    return { allowed: false, reason: 'Downloads must be started manually.' };
                }
                try {
                    const url = new URL(target.href, window.location.href);
                    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
                    return { allowed: true, reason: '' };
                } catch (error) {
                    return { allowed: false, reason: 'This link does not have a safe web destination.' };
                }
            }

            if (tag === 'input') {
                return ['checkbox', 'radio'].includes(String(target.type || '').toLowerCase())
                    ? { allowed: true, reason: '' }
                    : { allowed: false, reason: 'Text entry and form submission remain manual.' };
            }
            if (tag === 'button') {
                const type = String(target.getAttribute?.('type') || target.type || 'submit').toLowerCase();
                if (form && type !== 'button') {
                    return { allowed: false, reason: 'Form submission and reset controls remain manual.' };
                }
                return { allowed: true, reason: '' };
            }
            if (['option', 'tab', 'checkbox', 'radio'].includes(role)) {
                return { allowed: true, reason: '' };
            }
            return { allowed: false, reason: 'Unknown custom controls are highlighted but not automatically activated.' };
        }

        isSensitiveActionLabel(label) {
            return /\b(delete|remove|purchase|pay|checkout|buy|submit|send|publish|transfer|confirm order|place order|sign out|log out|unsubscribe|close account|cancel account)\b/i.test(String(label || ''));
        }

        hasAlternatingTargets(transitions) {
            if (transitions.length < 3) return false;
            const recent = transitions.slice(-3);
            return recent[0].from === recent[1].to &&
                recent[0].to === recent[1].from &&
                recent[1].to === recent[2].from &&
                recent[1].from === recent[2].to;
        }

        countRecentTargetTypes(samples) {
            return new Set(samples.slice(-12).map(item => item.targetId).filter(Boolean)).size;
        }

        redactSensitiveText(text) {
            return String(text || '')
                .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email removed]')
                .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[number removed]')
                .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, '[phone removed]')
                .replace(/\s+/g, ' ')
                .trim();
        }

        loadCursorBaseline() {
            try {
                const stored = JSON.parse(localStorage.getItem('aw-cursor-baseline-v1') || 'null');
                if (stored && Number.isFinite(stored.averageSpeed)) {
                    return Math.max(80, Math.min(1200, stored.averageSpeed));
                }
            } catch (error) {
                if (CONFIG.debug) console.debug('AdaptiveWeb cursor baseline unavailable', error);
            }
            return 350;
        }

        updateCursorBaseline(speed) {
            if (!Number.isFinite(speed) || speed < 15 || speed > 2500) return;
            const tracker = this.cursorTracker;
            tracker.baselineSpeed = tracker.baselineSpeed * 0.94 + speed * 0.06;
            tracker.baselineSamples += 1;

            if (tracker.baselineSamples % 40 === 0) {
                try {
                    localStorage.setItem('aw-cursor-baseline-v1', JSON.stringify({
                        averageSpeed: Math.round(tracker.baselineSpeed),
                        updatedAt: Date.now()
                    }));
                } catch (error) {
                    if (CONFIG.debug) console.debug('AdaptiveWeb cursor baseline could not be saved', error);
                }
            }
        }

        getCursorPromptCount() {
            try {
                return Number(sessionStorage.getItem('aw-cursor-prompt-count') || 0);
            } catch (error) {
                return 0;
            }
        }

        setCursorPromptCount(count) {
            try {
                sessionStorage.setItem('aw-cursor-prompt-count', String(count));
            } catch (error) {
                if (CONFIG.debug) console.debug('AdaptiveWeb prompt count could not be saved', error);
            }
        }

        // --- Feature 5: Exit Intent ---
        initExitIntent() {
            document.addEventListener('mouseleave', (e) => {
                if (e.clientY < CONFIG.exitThresholdY) {
                    this.onExitIntent();
                }
            });
        }

        onExitIntent() {
            if (this.exitTriggered) return;
            if (document.querySelector('.aw-suggestion-bubble')) return;
            // Check session storage to prevent annoyance
            if (sessionStorage.getItem('aw-exit-dismissed')) return;

            this.exitTriggered = true;

            if (CONFIG.debug) console.log('Detected: Exit Intent');
            this.api.log('exit_intent');

            // Calc Progress
            const scrollY = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const progress = (scrollY / docHeight) * 100;

            this.ui.showExitModal(progress, this.api);
        }
    }

    class ApiService {
        async post(endpoint, body, timeoutMs = 5000) {
            return new Promise((resolve) => {
                const requestId = 'req_' + Math.random().toString(36).substring(2, 9);
                let settled = false;
                const handler = (event) => {
                    if (event.data && event.data.type === 'AW_API_RESPONSE' && event.data.requestId === requestId) {
                        if (settled) return;
                        settled = true;
                        window.removeEventListener('message', handler);
                        resolve(event.data.error ? null : event.data.data);
                    }
                };
                window.addEventListener('message', handler);
                window.postMessage({ type: 'AW_API_REQUEST', requestId, endpoint, body }, '*');

                // Resolve cleanly without leaving page-level listeners behind.
                setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    window.removeEventListener('message', handler);
                    resolve(null);
                }, timeoutMs);
            });
        }

        async simplify(text) {
            return this.post('simplify', { text });
        }

        async summarize(text) {
            return this.post('summarize', { text }, 15000);
        }

        async suggest(text) {
            return this.post('suggest', { text }, 15000);
        }

        async getRelated(url) {
            return this.post('related', { url });
        }

        log(type, metadata = {}) {
            this.post('analytics', {
                eventType: type,
                domain: window.location.hostname,
                timestamp: new Date().toISOString(),
                metadata
            });
        }
    }

    class UIAdapter {
        constructor() {
            this.scrollSummaryRequestId = 0;
            this.currentScrollSummaryBox = null;
            this.currentTldrPrompt = null;
            this.currentTldrToolbar = null;
            this.injectStyles();
        }

        injectStyles() {
            const style = document.createElement('style');
            style.textContent = `
                /* Highlight */
                .aw-highlight {
                    background: rgba(255, 235, 59, 0.2);
                    box-shadow: 0 0 0 2px rgba(255, 235, 59, 0.4);
                    border-radius: 4px;
                    transition: all 0.3s;
                    position: relative;
                }
                .aw-simplify-btn {
                    position: absolute;
                    top: -25px;
                    right: 0;
                    background: #222;
                    color: #fff;
                    font-size: 12px;
                    padding: 4px 8px;
                    border-radius: 4px;
                    cursor: pointer;
                    z-index: 1000;
                    font-family: sans-serif;
                }
                
                /* Sidebar */
                .aw-sidebar {
                    position: fixed;
                    top: 0;
                    right: -320px;
                    width: 320px;
                    height: 100vh;
                    background: white;
                    box-shadow: -2px 0 10px rgba(0,0,0,0.1);
                    transition: right 0.3s ease-out;
                    z-index: 9999;
                    padding: 20px;
                    font-family: sans-serif;
                    overflow-y: auto;
                }
                .aw-sidebar.visible { right: 0; }
                .aw-card {
                    border: 1px solid #eee;
                    border-radius: 8px;
                    margin-bottom: 15px;
                    overflow: hidden;
                }
                .aw-card img { width: 100%; height: 100px; object-fit: cover; }
                .aw-card-content { padding: 10px; }
                
                /* Takeaways */
                .aw-takeaways {
                    position: fixed;
                    top: 80px;
                    right: 20px;
                    width: min(390px, calc(100vw - 40px));
                    max-height: calc(100vh - 120px);
                    background: white;
                    border-radius: 14px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.15);
                    padding: 15px;
                    z-index: 2147483645;
                    font-family: sans-serif;
                    border-left: 4px solid #3b82f6;
                    animation: slideIn 0.5s ease;
                    overflow-y: auto;
                }
                @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
                
                /* Exit Modal */
                .aw-modal-backdrop {
                    position: fixed;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.5);
                    z-index: 10000;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                .aw-modal {
                    background: white;
                    padding: 30px;
                    border-radius: 12px;
                    width: 400px;
                    text-align: center;
                    font-family: sans-serif;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                }
                .aw-btn {
                    background: #3b82f6;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 6px;
                    margin-top: 15px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: bold;
                }
                .aw-btn:hover { opacity: 0.9; }
                .aw-btn.secondary { background: #eee; color: #333; margin-left: 10px; }
                
                /* Universal Hover Styles */
                /* For LIGHT BG websites (Dark Overlay) */
                .aw-hover-light {
                    background-color: rgba(0, 0, 0, 0.9) !important;
                    color: white !important;
                    border: 2px solid white !important;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    border-radius: 8px;
                    transition: all 0.2s ease-out;
                    z-index: 1000;
                    position: relative;
                }
                
                /* For DARK BG websites (White Overlay) */
                .aw-hover-dark {
                    background-color: rgba(255, 255, 255, 0.9) !important;
                    color: black !important;
                    border: 2px solid black !important;
                    box-shadow: 0 10px 30px rgba(255,255,255,0.3);
                    border-radius: 8px;
                    transition: all 0.2s ease-out;
                    z-index: 1000;
                    position: relative;
                }
            `;
            document.head.appendChild(style);
        }

        applyHoverEffect(el, isCurrentBgDark, api) {
            // If current BG is Dark -> We want White Overlay (aw-hover-dark)
            // If current BG is Light -> We want Black Overlay (aw-hover-light)
            if (isCurrentBgDark) {
                el.classList.add('aw-hover-dark');
            } else {
                el.classList.add('aw-hover-light');
            }

            // Inject Summarize Button
            if (el.querySelector('.aw-summarize-btn')) return;

            const btn = document.createElement('div');
            btn.className = 'aw-summarize-btn';
            btn.innerHTML = '📝 Summarize';

            Object.assign(btn.style, {
                position: 'absolute',
                top: '-25px',
                right: '10px',
                background: isCurrentBgDark ? '#fff' : '#222',
                color: isCurrentBgDark ? '#000' : '#fff',
                fontSize: '12px',
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                zIndex: '1001',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                fontWeight: 'bold',
                fontFamily: 'sans-serif'
            });

            btn.onclick = async (e) => {
                e.stopPropagation();
                e.preventDefault();
                btn.innerHTML = 'Thinking...';

                // Use passed API or fallback
                const apiService = api || new ApiService();
                const text = el.innerText;
                const res = await apiService.summarize(text);

                if (res && res.summary) {
                    this.showTakeaways(res.summary);
                    btn.innerHTML = 'Done!';
                    setTimeout(() => btn.innerHTML = '📝 Summarize', 2000);
                } else {
                    btn.innerHTML = 'Error';
                }
            };

            // Relative position for absolute button
            const pos = window.getComputedStyle(el).position;
            if (pos === 'static') {
                el.style.position = 'relative';
            }

            el.appendChild(btn);
        }

        removeHoverEffect(el) {
            if (el) {
                el.classList.remove('aw-hover-light', 'aw-hover-dark');
                const btn = el.querySelector('.aw-summarize-btn');
                if (btn) btn.remove();
            }
        }

        // 1. Difficulty
        highlightAndPrompt(p, onSimplify) {
            p.classList.add('aw-highlight');
            const btn = document.createElement('div');
            btn.className = 'aw-simplify-btn';
            btn.innerHTML = '✨ Simplify';
            btn.onclick = (e) => {
                e.stopPropagation();
                btn.innerHTML = 'Thinking...';
                onSimplify();
            };
            // Insert relative to P
            p.style.position = 'relative';
            p.appendChild(btn);
        }

        updateParagraph(p, text) {
            p.innerHTML = text; // Replace content
            p.classList.remove('aw-highlight');
            const btn = p.querySelector('.aw-simplify-btn');
            if (btn) btn.remove();

            p.style.borderLeft = "4px solid #4caf50";
            p.style.paddingLeft = "10px";
        }

        // 2. Sidebar
        showSidebar(articles) {
            const sidebar = document.createElement('div');
            sidebar.className = 'aw-sidebar';
            sidebar.innerHTML = `
                <h2>You might also like</h2>
                <hr style="margin: 10px 0; border: 0; border-top: 1px solid #eee;">
                ${articles.map(a => `
                    <div class="aw-card">
                        <img src="${a.image}" alt="">
                        <div class="aw-card-content">
                            <strong>${a.title}</strong>
                        </div>
                    </div>
                `).join('')}
                <button class="aw-btn" style="width:100%" id="aw-sidebar-close">Close</button>
            `;
            document.body.appendChild(sidebar);

            sidebar.querySelector('#aw-sidebar-close').onclick = () => {
                sidebar.classList.remove('visible');
                setTimeout(() => sidebar.remove(), 300);
            }

            // Trigger reflow
            sidebar.offsetHeight;
            sidebar.classList.add('visible');
        }

        // 3. Takeaways
        showToast(msg) {
            // Optional simple toast
            console.log(msg);
        }

        showScrollToast(message) {
            document.querySelector('.aw-scroll-toast')?.remove();
            const toast = document.createElement('div');
            toast.className = 'aw-scroll-toast';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            toast.textContent = String(message || 'AdaptiveWeb detected rapid scrolling.');
            document.body.appendChild(toast);
            requestAnimationFrame(() => toast.classList.add('aw-visible'));
            setTimeout(() => {
                toast.classList.remove('aw-visible');
                setTimeout(() => toast.remove(), 220);
            }, 4200);
        }

        showTldrPrompt({ sourceLabel, onApply, onAlways, onDismiss }) {
            this.dismissTldrPrompt('replaced');
            document.querySelector('.aw-scroll-toast')?.remove();

            const prompt = document.createElement('aside');
            prompt.className = 'aw-tldr-prompt';
            prompt.setAttribute('role', 'dialog');
            prompt.setAttribute('aria-modal', 'false');
            prompt.setAttribute('aria-label', 'Compact reading suggestion');
            const heading = document.createElement('strong');
            heading.className = 'aw-tldr-prompt-heading';
            heading.textContent = 'Make this easier to skim?';
            const message = document.createElement('p');
            message.textContent = `AdaptiveWeb can condense long paragraphs in ${String(sourceLabel || 'this content')} into local key points.`;
            const actions = document.createElement('div');
            actions.className = 'aw-tldr-prompt-actions';

            const apply = document.createElement('button');
            apply.type = 'button';
            apply.className = 'aw-tldr-primary';
            apply.textContent = 'Compact view';
            const always = document.createElement('button');
            always.type = 'button';
            always.className = 'aw-tldr-secondary';
            always.textContent = 'Always on this site';
            const dismissButton = document.createElement('button');
            dismissButton.type = 'button';
            dismissButton.className = 'aw-tldr-quiet';
            dismissButton.textContent = 'Not now';
            actions.append(apply, always, dismissButton);

            const privacy = document.createElement('small');
            privacy.className = 'aw-tldr-prompt-note';
            privacy.textContent = 'Key points are selected locally. Original page content is preserved.';
            prompt.append(heading, message, actions, privacy);
            document.body.appendChild(prompt);

            let settled = false;
            let timeoutId;
            const escapeHandler = event => {
                if (event.key === 'Escape') dismiss('escape');
            };
            const dismiss = (reason, action) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                document.removeEventListener('keydown', escapeHandler, true);
                prompt.classList.remove('aw-visible');
                setTimeout(() => prompt.remove(), 200);
                this.currentTldrPrompt = null;
                if (typeof action === 'function') action();
                else if (typeof onDismiss === 'function') onDismiss(reason);
            };
            this.currentTldrPrompt = { element: prompt, dismiss };
            apply.addEventListener('click', () => dismiss('apply', onApply));
            always.addEventListener('click', () => dismiss('always', onAlways));
            dismissButton.addEventListener('click', () => dismiss('not-now'));
            document.addEventListener('keydown', escapeHandler, true);
            requestAnimationFrame(() => prompt.classList.add('aw-visible'));
            timeoutId = setTimeout(() => dismiss('timeout'), 12000);
            apply.focus({ preventScroll: true });
            return true;
        }

        dismissTldrPrompt(reason = 'dismissed') {
            if (!this.currentTldrPrompt) return false;
            this.currentTldrPrompt.dismiss(reason);
            return true;
        }

        showTldrToolbar({ count, sourceLabel, preference, onExpandAll, onCollapseAll, onPreference, onDisable, onExit }) {
            this.removeTldrToolbar();
            const toolbar = document.createElement('aside');
            toolbar.className = 'aw-tldr-toolbar';
            toolbar.setAttribute('role', 'region');
            toolbar.setAttribute('aria-label', 'Compact reading controls');

            const header = document.createElement('div');
            header.className = 'aw-tldr-toolbar-header';
            const heading = document.createElement('strong');
            heading.textContent = 'Compact reading';
            const status = document.createElement('span');
            status.textContent = `${Number(count || 0)} paragraphs condensed · ${String(sourceLabel || 'Page')}`;
            header.append(heading, status);

            const controls = document.createElement('div');
            controls.className = 'aw-tldr-toolbar-controls';
            const createControl = (label, className, handler) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = className;
                button.textContent = label;
                button.addEventListener('click', handler);
                return button;
            };
            controls.append(
                createControl('Expand all', 'aw-tldr-secondary', onExpandAll),
                createControl('Key points only', 'aw-tldr-secondary', onCollapseAll),
                createControl(
                    preference === 'auto' ? 'Use Ask mode' : 'Make automatic',
                    'aw-tldr-secondary',
                    () => onPreference(preference === 'auto' ? 'ask' : 'auto')
                ),
                createControl('Disable for this tab', 'aw-tldr-quiet', onDisable),
                createControl('Exit compact view', 'aw-tldr-primary', onExit)
            );
            toolbar.append(header, controls);
            document.body.appendChild(toolbar);
            this.currentTldrToolbar = toolbar;
            requestAnimationFrame(() => toolbar.classList.add('aw-visible'));
            return toolbar;
        }

        removeTldrToolbar() {
            if (!this.currentTldrToolbar) return;
            this.currentTldrToolbar.remove();
            this.currentTldrToolbar = null;
        }

        createScrollSummaryShell({ sourceLabel, maxDepth }) {
            this.currentScrollSummaryBox?.remove();
            if (this.scrollSummaryEscapeHandler) {
                document.removeEventListener('keydown', this.scrollSummaryEscapeHandler, true);
            }

            const box = document.createElement('aside');
            box.className = 'aw-summary-box';
            box.setAttribute('role', 'dialog');
            box.setAttribute('aria-modal', 'false');
            box.setAttribute('aria-label', 'Automatic scroll-back summary');
            box.setAttribute('aria-live', 'polite');

            const header = document.createElement('div');
            header.className = 'aw-summary-box-header';
            const headingGroup = document.createElement('div');
            const eyebrow = document.createElement('span');
            eyebrow.className = 'aw-summary-eyebrow';
            eyebrow.textContent = 'Scroll-back summary';
            const heading = document.createElement('strong');
            heading.className = 'aw-summary-heading';
            heading.textContent = 'Key takeaways from your skim';
            headingGroup.append(eyebrow, heading);

            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'aw-close-btn';
            close.setAttribute('aria-label', 'Dismiss summary');
            close.textContent = '\u00d7';
            header.append(headingGroup, close);

            const meta = document.createElement('div');
            meta.className = 'aw-summary-meta';
            const source = document.createElement('span');
            source.textContent = String(sourceLabel || 'Page');
            const depth = document.createElement('span');
            const percent = Math.max(0, Math.min(100, Math.round(Number(maxDepth || 0) * 100)));
            depth.textContent = `${percent}% depth reached`;
            meta.append(source, depth);

            const content = document.createElement('div');
            content.className = 'aw-scroll-summary-content';
            const footer = document.createElement('div');
            footer.className = 'aw-summary-footer';
            const privacy = document.createElement('small');
            privacy.className = 'aw-summary-privacy';
            privacy.textContent = 'Only redacted text from the content you passed was used.';
            footer.appendChild(privacy);

            box.append(header, meta, content, footer);
            document.body.appendChild(box);
            this.currentScrollSummaryBox = box;
            this.scrollSummaryOnDismiss = null;
            this.scrollSummaryEscapeHandler = (event) => {
                if (event.key === 'Escape') {
                    this.closeScrollSummary('escape', this.scrollSummaryOnDismiss);
                }
            };
            document.addEventListener('keydown', this.scrollSummaryEscapeHandler, true);
            requestAnimationFrame(() => box.classList.add('aw-visible'));
            return box;
        }

        closeScrollSummary(reason = 'dismissed', onDismiss = null) {
            const box = this.currentScrollSummaryBox;
            if (!box) return;
            this.scrollSummaryRequestId += 1;
            this.currentScrollSummaryBox = null;
            if (this.scrollSummaryEscapeHandler) {
                document.removeEventListener('keydown', this.scrollSummaryEscapeHandler, true);
                this.scrollSummaryEscapeHandler = null;
            }
            this.scrollSummaryOnDismiss = null;
            box.classList.remove('aw-visible');
            setTimeout(() => box.remove(), 220);
            if (typeof onDismiss === 'function') onDismiss(reason);
        }

        showScrollSummaryLoading({ sourceLabel, maxDepth }) {
            const requestId = ++this.scrollSummaryRequestId;
            const box = this.createScrollSummaryShell({ sourceLabel, maxDepth });
            box.dataset.requestId = String(requestId);
            const content = box.querySelector('.aw-scroll-summary-content');
            const loading = document.createElement('div');
            loading.className = 'aw-summary-loading';
            loading.setAttribute('aria-busy', 'true');
            const spinner = document.createElement('span');
            spinner.className = 'aw-summary-spinner';
            spinner.setAttribute('aria-hidden', 'true');
            const text = document.createElement('span');
            text.textContent = 'Preparing three concise takeaways...';
            loading.append(spinner, text);
            content.appendChild(loading);
            box.querySelector('.aw-close-btn').addEventListener('click', () => this.closeScrollSummary('loading-dismissed'));
            return requestId;
        }

        showScrollSummary({ requestId, summary, method, sourceLabel, onReadFromStart, onDismiss }) {
            if (requestId !== this.scrollSummaryRequestId || !this.currentScrollSummaryBox) return false;
            this.scrollSummaryOnDismiss = onDismiss;
            const box = this.currentScrollSummaryBox;
            const content = box.querySelector('.aw-scroll-summary-content');
            const footer = box.querySelector('.aw-summary-footer');
            content.replaceChildren();

            const badge = document.createElement('span');
            badge.className = method === 'Gemini summary'
                ? 'aw-summary-method aw-summary-method--ai'
                : 'aw-summary-method aw-summary-method--local';
            badge.textContent = String(method || 'Local summary');
            content.appendChild(badge);

            const lines = String(summary || '')
                .split(/\n+/)
                .map(line => line.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s*/, '').trim())
                .filter(Boolean)
                .slice(0, 4);
            if (lines.length > 1) {
                const list = document.createElement('ul');
                list.className = 'aw-summary-list';
                lines.forEach(line => {
                    const item = document.createElement('li');
                    item.textContent = line;
                    list.appendChild(item);
                });
                content.appendChild(list);
            } else {
                const paragraph = document.createElement('p');
                paragraph.className = 'aw-summary-text';
                paragraph.textContent = lines[0] || 'Review the main headings before continuing.';
                content.appendChild(paragraph);
            }

            const actions = document.createElement('div');
            actions.className = 'aw-summary-actions';
            const restart = document.createElement('button');
            restart.type = 'button';
            restart.className = 'aw-read-full-btn';
            restart.textContent = sourceLabel === 'Scrollable section' ? 'Read section from start' : 'Read from start';
            restart.addEventListener('click', () => {
                if (typeof onReadFromStart === 'function') onReadFromStart();
                this.closeScrollSummary('read-from-start');
            });
            const dismiss = document.createElement('button');
            dismiss.type = 'button';
            dismiss.className = 'aw-summary-dismiss-btn';
            dismiss.textContent = 'Dismiss';
            dismiss.addEventListener('click', () => this.closeScrollSummary('dismissed', onDismiss));
            actions.append(restart, dismiss);
            footer.prepend(actions);

            const loadingClose = box.querySelector('.aw-close-btn');
            const close = loadingClose.cloneNode(true);
            loadingClose.replaceWith(close);
            close.addEventListener('click', () => this.closeScrollSummary('dismissed', onDismiss));
            return true;
        }

        showLegacySuggestion(coords, onAction) {
            if (document.querySelector('.aw-suggestion-bubble')) return;

            const bubble = document.createElement('div');
            bubble.className = 'aw-suggestion-bubble';
            bubble.innerHTML = `
                <div class="aw-suggestion-arrow"></div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:14px;">💡 Need a hint?</span>
                    <button class="aw-help-btn">Suggest Actions</button>
                    <div class="aw-suggestion-close">&times;</div>
                </div>
            `;

            // Inline Styles for Bubble (Injecting class in stylesheet is cleaner but this works for now)
            Object.assign(bubble.style, {
                position: 'absolute',
                left: (coords.x + window.scrollX + 20) + 'px',
                top: (coords.y + window.scrollY) + 'px',
                background: '#fff',
                color: '#333',
                padding: '8px 12px',
                borderRadius: '50px', // Pill shape
                boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
                zIndex: '9999',
                fontFamily: 'sans-serif',
                border: '1px solid #eee',
                animation: 'fadeIn 0.3s ease',
                display: 'flex',
                alignItems: 'center'
            });

            // Button Style
            const btn = bubble.querySelector('.aw-help-btn');
            Object.assign(btn.style, {
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '20px',
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginLeft: '5px'
            });

            // Close Style
            const close = bubble.querySelector('.aw-suggestion-close');
            Object.assign(close.style, {
                marginLeft: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                color: '#888'
            });

            document.body.appendChild(bubble);

            // Events
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                onAction();
                bubble.remove();
            };

            close.onclick = (e) => {
                e.stopPropagation();
                bubble.remove();
            };

            // Auto-dismiss after 8 seconds
            setTimeout(() => {
                if (bubble.isConnected) bubble.remove();
            }, 8000);
        }

        showSuggestion(analysis, callbacks) {
            if (document.querySelector('.aw-suggestion-bubble')) return false;

            const bubble = document.createElement('div');
            bubble.className = 'aw-suggestion-bubble aw-suggestion-bubble--advanced';
            bubble.setAttribute('role', 'dialog');
            bubble.setAttribute('aria-live', 'polite');
            bubble.setAttribute('aria-label', 'AdaptiveWeb contextual assistance');

            bubble.innerHTML = `
                <div class="aw-suggestion-arrow" aria-hidden="true"></div>
                <div class="aw-suggestion-header">
                    <span class="aw-suggestion-icon" aria-hidden="true">?</span>
                    <div class="aw-suggestion-heading-group">
                        <strong class="aw-suggestion-heading">Need help here?</strong>
                        <span class="aw-suggestion-pattern"></span>
                    </div>
                    <button class="aw-suggestion-close" type="button" aria-label="Dismiss assistance">&times;</button>
                </div>
                <p class="aw-suggestion-message"></p>
                <div class="aw-suggestion-actions">
                    <button class="aw-help-btn aw-help-primary" type="button">AI Suggestions</button>
                    <button class="aw-local-help-btn" type="button"></button>
                </div>
                <small class="aw-suggestion-privacy">Mouse patterns stay on this device. AI sends redacted nearby page context only after you choose it.</small>
            `;

            const patternNames = {
                stationary_near_action: 'Paused near an action',
                circular_searching: 'Searching pattern',
                zigzag_uncertainty: 'Exploring nearby options',
                choice_oscillation: 'Comparing choices',
                approach_and_retreat: 'Repeatedly revisited',
                repeated_dead_click: 'Control not responding',
                form_difficulty: 'Form needs attention'
            };
            const localLabels = {
                form_field: 'Check Form',
                choice: 'Compare Locally',
                button: 'Inspect Control',
                link: 'Inspect Link'
            };

            bubble.querySelector('.aw-suggestion-pattern').textContent = patternNames[analysis.pattern] || 'Contextual assistance';
            bubble.querySelector('.aw-suggestion-message').textContent = analysis.targetLabel
                ? `It looks like you may need help with “${analysis.targetLabel}”.`
                : 'It looks like you may need help with this part of the page.';
            bubble.querySelector('.aw-local-help-btn').textContent =
                analysis.pattern === 'choice_oscillation'
                    ? 'Compare Locally'
                    : localLabels[analysis.targetType] || 'Explain Locally';

            document.body.appendChild(bubble);

            const coords = analysis.coords || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            const rect = bubble.getBoundingClientRect();
            const margin = 12;
            const preferredLeft = coords.x + 18;
            const preferredTop = coords.y + 18;
            const left = Math.max(margin, Math.min(preferredLeft, window.innerWidth - rect.width - margin));
            const top = preferredTop + rect.height < window.innerHeight - margin
                ? preferredTop
                : Math.max(margin, coords.y - rect.height - 18);
            bubble.style.left = `${left}px`;
            bubble.style.top = `${top}px`;

            requestAnimationFrame(() => bubble.classList.add('aw-visible'));

            let settled = false;
            let timeoutId;
            const escapeHandler = (event) => {
                if (event.key === 'Escape') dismiss('escape');
            };
            const dismiss = (reason, action) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                document.removeEventListener('keydown', escapeHandler, true);
                bubble.classList.remove('aw-visible');
                setTimeout(() => bubble.remove(), 180);
                if (action) action();
                else if (callbacks.onDismiss) callbacks.onDismiss(reason);
            };

            bubble.querySelector('.aw-help-btn').addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                dismiss('accepted_ai', callbacks.onSuggest);
            });
            bubble.querySelector('.aw-local-help-btn').addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                dismiss('accepted_local', callbacks.onLocal);
            });
            bubble.querySelector('.aw-suggestion-close').addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                dismiss('close');
            });
            document.addEventListener('keydown', escapeHandler, true);

            timeoutId = setTimeout(() => dismiss('timeout'), 10000);
            return true;
        }

        highlightAssistedTarget(target) {
            if (!target || !target.classList) return;
            target.classList.add('aw-assisted-target');
            target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            setTimeout(() => target.classList.remove('aw-assisted-target'), 3500);
        }

        updateSummaryContent(newText, suggestions = [], options = {}) {
            if (this.currentSummaryBox) {
                const contentDiv = this.currentSummaryBox.querySelector('.aw-summary-content');
                if (!contentDiv) return;

                contentDiv.replaceChildren();
                if (options.sourceLabel) {
                    const source = document.createElement('span');
                    source.className = `aw-assistance-source aw-assistance-source--${options.source || 'local'}`;
                    source.textContent = String(options.sourceLabel);
                    contentDiv.appendChild(source);
                }

                const summary = document.createElement('p');
                summary.className = 'aw-context-summary-text';
                summary.textContent = String(newText || 'Here are some options.');
                contentDiv.appendChild(summary);

                if (Array.isArray(suggestions) && suggestions.length > 0) {
                    const list = document.createElement('div');
                    list.className = 'aw-context-suggestions';
                    suggestions.slice(0, 4).forEach((suggestion, index) => {
                        const action = typeof suggestion === 'string'
                            ? { id: `legacy-${index + 1}`, label: suggestion, description: '', actionType: 'highlight' }
                            : suggestion || {};
                        const card = document.createElement(options.onAction ? 'button' : 'div');
                        if (options.onAction) card.type = 'button';
                        card.className = 'aw-suggestion-card';

                        const label = document.createElement('strong');
                        label.className = 'aw-suggestion-card-label';
                        label.textContent = String(action.label || 'Review this control');
                        card.appendChild(label);

                        if (action.description) {
                            const description = document.createElement('span');
                            description.className = 'aw-suggestion-card-description';
                            description.textContent = String(action.description);
                            card.appendChild(description);
                        }

                        if (options.onAction) {
                            const affordance = document.createElement('span');
                            affordance.className = 'aw-suggestion-card-affordance';
                            affordance.textContent = action.actionType === 'activate' ? 'Review action →' : 'Show me →';
                            card.appendChild(affordance);
                            card.addEventListener('click', () => options.onAction(action));
                        }
                        list.appendChild(card);
                    });
                    contentDiv.appendChild(list);
                }

                const status = document.createElement('div');
                status.className = 'aw-assistance-status';
                status.setAttribute('aria-live', 'polite');
                contentDiv.appendChild(status);

                if (typeof options.onFeedback === 'function') {
                    const feedback = document.createElement('div');
                    feedback.className = 'aw-assistance-feedback';
                    const question = document.createElement('span');
                    question.textContent = 'Was this helpful?';
                    const helpful = document.createElement('button');
                    helpful.type = 'button';
                    helpful.textContent = 'Yes';
                    const notHelpful = document.createElement('button');
                    notHelpful.type = 'button';
                    notHelpful.textContent = 'Not really';
                    const submitFeedback = (value) => {
                        options.onFeedback(value);
                        helpful.disabled = true;
                        notHelpful.disabled = true;
                        question.textContent = 'Thanks — your feedback was saved locally.';
                    };
                    helpful.addEventListener('click', () => submitFeedback(true));
                    notHelpful.addEventListener('click', () => submitFeedback(false));
                    feedback.append(question, helpful, notHelpful);
                    contentDiv.appendChild(feedback);
                }
            }
        }

        setAssistanceStatus(message, tone = 'info') {
            if (!this.currentSummaryBox) return;
            let status = this.currentSummaryBox.querySelector('.aw-assistance-status');
            if (!status) {
                status = document.createElement('div');
                status.className = 'aw-assistance-status';
                this.currentSummaryBox.querySelector('.aw-summary-content')?.appendChild(status);
            }
            status.className = `aw-assistance-status aw-assistance-status--${tone}`;
            status.textContent = String(message || '');
        }

        showActionConfirmation(action, onConfirm) {
            if (!this.currentSummaryBox) return;
            const content = this.currentSummaryBox.querySelector('.aw-summary-content');
            if (!content) return;
            content.querySelector('.aw-action-confirmation')?.remove();

            const panel = document.createElement('div');
            panel.className = 'aw-action-confirmation';
            const title = document.createElement('strong');
            title.textContent = 'Confirm this page action';
            const message = document.createElement('p');
            message.textContent = `AdaptiveWeb can activate “${String(action.label || 'this control')}”. Nothing will happen unless you confirm.`;
            const buttons = document.createElement('div');
            buttons.className = 'aw-action-confirmation-buttons';
            const confirm = document.createElement('button');
            confirm.type = 'button';
            confirm.className = 'aw-action-confirm';
            confirm.textContent = 'Confirm action';
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'aw-action-cancel';
            cancel.textContent = 'Cancel';
            confirm.addEventListener('click', () => {
                panel.remove();
                this.setAssistanceStatus('Action confirmed. Activating the selected control.', 'success');
                onConfirm();
            });
            cancel.addEventListener('click', () => {
                panel.remove();
                this.setAssistanceStatus('Action cancelled. No page control was activated.', 'info');
            });
            buttons.append(confirm, cancel);
            panel.append(title, message, buttons);
            content.appendChild(panel);
            confirm.focus();
        }
        showLegacySummary(initialText, isLoading = false) {
            // Remove existing if any
            if (this.currentSummaryBox && this.currentSummaryBox.isConnected) {
                this.currentSummaryBox.remove();
            }

            const box = document.createElement('div');
            box.className = 'aw-takeaways'; // Reuse existing styles
            this.currentSummaryBox = box;

            box.innerHTML = `
                <h3 style="margin:0 0 10px 0">⚡ Adaptive Helper</h3>
                <div class="aw-summary-content">
                    <p style="font-size: 14px; line-height: 1.5; color: #444;">
                        ${isLoading ? '<i>' + initialText + '</i>' : initialText}
                    </p>
                </div>
                <div style="text-align:right; margin-top:10px;">
                    <small style="color:#888; cursor:pointer;" id="aw-takeaways-close">Dismiss</small>
                </div>
            `;
            document.body.appendChild(box);

            box.querySelector('#aw-takeaways-close').onclick = () => {
                box.remove();
                this.currentSummaryBox = null;
            };
        }

        showSummary(initialText, isLoading = false) {
            if (this.currentSummaryBox && this.currentSummaryBox.isConnected) {
                this.currentSummaryBox.remove();
            }

            const box = document.createElement('div');
            box.className = 'aw-takeaways';
            box.setAttribute('role', 'dialog');
            box.setAttribute('aria-label', 'AdaptiveWeb assistance');
            box.setAttribute('aria-live', 'polite');
            this.currentSummaryBox = box;

            const heading = document.createElement('h3');
            heading.textContent = 'Adaptive Helper';
            heading.style.margin = '0 0 10px 0';

            const content = document.createElement('div');
            content.className = 'aw-summary-content';
            const paragraph = document.createElement('p');
            paragraph.className = 'aw-context-summary-text';
            paragraph.textContent = String(initialText || '');
            if (isLoading) paragraph.setAttribute('aria-busy', 'true');
            content.appendChild(paragraph);

            const footer = document.createElement('div');
            footer.style.textAlign = 'right';
            footer.style.marginTop = '10px';
            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'aw-summary-dismiss';
            close.textContent = 'Dismiss';
            close.addEventListener('click', () => {
                box.remove();
                this.currentSummaryBox = null;
            });
            footer.appendChild(close);

            box.append(heading, content, footer);
            document.body.appendChild(box);
        }

        showTakeaways(summary) {
            // "Summarize" button output -> Use same box but add expansion logic
            if (this.currentSummaryBox && this.currentSummaryBox.isConnected) {
                this.currentSummaryBox.remove();
            }

            const box = document.createElement('div');
            box.className = 'aw-takeaways';
            this.currentSummaryBox = box;

            // Simple truncate for visual cleaness, "Expand" to see full
            const isLong = summary.length > 150; // Lowered from 300
            const displaySummary = isLong ? summary.substring(0, 150) + '...' : summary;

            box.innerHTML = `
                <h3 style="margin:0 0 10px 0">⚡ Key Takeaways</h3>
                <div class="aw-summary-content">
                    <p style="font-size: 14px; line-height: 1.5; color: #444;">${displaySummary}</p>
                </div>
                ${isLong ? '<div style="margin-top:5px;"><button id="aw-expand-btn" style="background:none; border:none; color:#3b82f6; cursor:pointer; font-size:12px; font-weight:bold; padding:0;">View Full Context ⬇</button></div>' : ''}
                <div style="text-align:right; margin-top:10px;">
                    <small style="color:#888; cursor:pointer;" id="aw-takeaways-close">Dismiss</small>
                </div>
            `;
            document.body.appendChild(box);

            // Expand Logic
            if (isLong) {
                box.querySelector('#aw-expand-btn').onclick = (e) => {
                    e.target.remove();
                    box.querySelector('.aw-summary-content p').innerText = summary;
                };
            }

            box.querySelector('#aw-takeaways-close').onclick = () => box.remove();
        }

        showExitModal(progress, api) {
            if (document.querySelector('.aw-modal-backdrop')) return;

            let title = "Wait!";
            let text = "Don't miss out.";
            let btnText = "Stay";

            if (progress < 30) {
                title = "Save for later?";
                text = "You've barely started. Enter your email to get the PDF.";
                btnText = "Save Article";
            } else if (progress > 70) {
                title = "Loved it?";
                text = "Share this with your network before you go.";
                btnText = "Share Article";
            } else {
                title = "Jump to conclusion?";
                text = "Short on time? Read the summary instead.";
                btnText = "Show Summary";
            }

            const backdrop = document.createElement('div');
            backdrop.className = 'aw-modal-backdrop';
            backdrop.innerHTML = `
                <div class="aw-modal">
                    <h2>${title}</h2>
                    <p style="color:#666; margin: 15px 0;">${text}</p>
                    <button class="aw-btn" id="aw-modal-pri">${btnText}</button>
                    <button class="aw-btn secondary" id="aw-modal-sec">Close</button>
                </div>
            `;
            document.body.appendChild(backdrop);

            // Handlers
            const close = () => {
                backdrop.remove();
                sessionStorage.setItem('aw-exit-dismissed', 'true'); // Prevent reappear
            };

            backdrop.querySelector('#aw-modal-sec').onclick = close;

            const primaryBtn = backdrop.querySelector('#aw-modal-pri');
            primaryBtn.onclick = async () => {
                if (btnText === "Show Summary") {
                    primaryBtn.innerText = "Summarizing...";
                    const text = document.body.innerText.substring(0, 2000);
                    const summary = await api.summarize(text);
                    if (summary) {
                        this.showTakeaways(summary.summary);
                        close();
                    }
                } else {
                    alert("Feature coming soon!");
                    close();
                }
            };
        }
    }

    class ShortcutsManager {
        constructor(api) {
            this.api = api;
            this.shortcuts = [];
            this.targetMap = new Map();
            this.pageActions = [];
            this.pendingChords = [];
            this.sequenceTimer = null;
            this.sequenceTimeout = 1200;
            this.container = null;
            this.statusElement = null;
            this.isCollapsed = false;
            this.startedListening = false;
            this.init();
        }

        async init() {
            const context = this.buildShortcutContext();

            // Render deterministic, working shortcuts immediately. Gemini may replace
            // them only with shortcuts grounded to the same discovered controls.
            this.shortcuts = this.prepareShortcuts(this.getLocalFallbackShortcuts(), 'Local shortcuts');
            this.renderSidebar();
            this.startListening();

            const res = await this.api.post('shortcuts', { text: JSON.stringify(context) });
            const grounded = this.prepareShortcuts(res?.shortcuts, res?.method || 'AI shortcuts');
            if (grounded.length >= 3) {
                this.shortcuts = grounded;
                this.renderSidebar();
            }
        }

        buildShortcutContext() {
            const availableActions = this.collectPageActions();
            return {
                schemaVersion: 2,
                page: {
                    domain: window.location.hostname,
                    title: String(document.title || '').slice(0, 160)
                },
                availableActions,
                builtInActions: [
                    { actionType: 'scroll_top', label: 'Go to page start' },
                    { actionType: 'scroll_bottom', label: 'Go to page end' },
                    { actionType: 'toggle_shortcuts', label: 'Show or hide shortcuts' }
                ]
            };
        }

        collectPageActions() {
            this.targetMap.clear();
            const actions = [];
            const seen = new Set();
            const selector = [
                'a[href]',
                'button',
                'input:not([type="hidden"])',
                'select',
                'textarea',
                '[role="button"]',
                '[role="link"]',
                '[role="menuitem"]',
                '[tabindex]:not([tabindex="-1"])'
            ].join(',');
            const candidates = Array.from(document.querySelectorAll(selector));

            for (const target of candidates) {
                if (actions.length >= 30 || !this.isUsableTarget(target)) continue;
                const label = this.getTargetLabel(target);
                if (!label) continue;
                const type = this.getTargetType(target);
                const identity = `${type}:${label.toLowerCase()}`;
                if (seen.has(identity)) continue;
                seen.add(identity);

                const targetId = `shortcut-target-${actions.length + 1}`;
                const capabilities = [];
                if (this.isProgrammaticallyFocusable(target)) capabilities.push('focus');
                if (this.isSafelyActivatable(target)) capabilities.push('activate');
                if (capabilities.length === 0) continue;
                this.targetMap.set(targetId, target);
                actions.push({ targetId, label, type, capabilities });
            }
            this.pageActions = actions;
            return actions;
        }

        isUsableTarget(target) {
            if (!target || target.closest?.('[data-aw-shortcuts-root], .aw-suggestion-bubble, .aw-summary-box, .aw-tldr-toolbar')) return false;
            if (target.disabled || target.getAttribute?.('aria-disabled') === 'true' || target.hidden) return false;
            const style = window.getComputedStyle ? window.getComputedStyle(target) : null;
            if (style && (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none')) return false;
            const rect = target.getBoundingClientRect?.();
            return !rect || (rect.width > 0 && rect.height > 0);
        }

        isProgrammaticallyFocusable(target) {
            const tag = String(target?.tagName || '').toUpperCase();
            if (['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return true;
            return Number(target?.tabIndex) >= 0;
        }

        getTargetLabel(target) {
            const labelledBy = target.getAttribute?.('aria-labelledby');
            const labelledText = labelledBy
                ? labelledBy.split(/\s+/).map(id => document.getElementById(id)?.innerText || '').join(' ')
                : '';
            const label = target.getAttribute?.('aria-label') ||
                labelledText ||
                target.labels?.[0]?.innerText ||
                target.innerText ||
                target.value ||
                target.getAttribute?.('title') ||
                target.getAttribute?.('placeholder') ||
                '';
            return String(label).replace(/\s+/g, ' ').trim().slice(0, 100);
        }

        getTargetType(target) {
            const role = target.getAttribute?.('role');
            if (role) return role;
            const tag = String(target.tagName || 'control').toLowerCase();
            if (tag === 'input') return String(target.type || 'input').toLowerCase();
            return tag;
        }

        getLocalFallbackShortcuts() {
            const shortcuts = [
                { key: 'Alt+Shift+Home', action: 'Go to page start', actionType: 'scroll_top', targetId: null },
                { key: 'Alt+Shift+End', action: 'Go to page end', actionType: 'scroll_bottom', targetId: null },
                { key: 'Alt+Shift+?', action: 'Show or hide shortcuts', actionType: 'toggle_shortcuts', targetId: null }
            ];
            this.pageActions.slice(0, 2).forEach((target, index) => {
                shortcuts.push({
                    key: `Alt+Shift+${index + 1}`,
                    action: `Go to ${target.label}`,
                    actionType: target.capabilities.includes('focus') ? 'focus' : 'activate',
                    targetId: target.targetId,
                    targetLabel: target.label
                });
            });
            return shortcuts;
        }

        prepareShortcuts(rawShortcuts, source = 'Local shortcuts') {
            if (!Array.isArray(rawShortcuts)) return [];
            const supportedActions = new Set(['focus', 'activate', 'scroll_top', 'scroll_bottom', 'toggle_shortcuts']);
            const used = new Set();
            const prepared = [];

            for (const raw of rawShortcuts) {
                if (!raw || typeof raw !== 'object') continue;
                const binding = this.parseShortcutKey(raw.key);
                const actionType = String(raw.actionType || '').toLowerCase();
                if (!binding || !supportedActions.has(actionType) || used.has(binding.signature)) continue;

                const targetId = raw.targetId ? String(raw.targetId) : null;
                let resolvedType = actionType;
                if (resolvedType === 'focus' || resolvedType === 'activate') {
                    const target = this.targetMap.get(targetId);
                    if (!target || !target.isConnected) continue;
                    if (resolvedType === 'activate' && !this.isSafelyActivatable(target)) resolvedType = 'focus';
                }

                used.add(binding.signature);
                prepared.push({
                    key: binding.display,
                    chords: binding.chords,
                    signature: binding.signature,
                    action: String(raw.action || 'Shortcut action').replace(/\s+/g, ' ').trim().slice(0, 100),
                    actionType: resolvedType,
                    targetId,
                    targetLabel: String(raw.targetLabel || '').slice(0, 100),
                    source
                });
                if (prepared.length >= 5) break;
            }
            return prepared;
        }

        parseShortcutKey(value) {
            const text = String(value || '').replace(/\s+/g, ' ').trim();
            if (!text || text.length > 80) return null;
            const parts = text.split(/\s+(?:then|→)\s+|\s*,\s*/i).filter(Boolean);
            if (parts.length === 0 || parts.length > 4) return null;
            const chords = parts.map(part => this.parseChord(part));
            if (chords.some(chord => !chord)) return null;
            const signature = chords.join(' then ');
            return { display: this.formatShortcut(chords), chords, signature };
        }

        parseChord(value) {
            const tokens = String(value || '').split(/\s*\+\s*/).filter(Boolean);
            if (tokens.length === 0 || tokens.length > 5) return null;
            const modifiers = new Set();
            let baseKey = null;
            for (const token of tokens) {
                const normalized = this.normalizeBaseKey(token);
                const modifier = { control: 'ctrl', ctrl: 'ctrl', option: 'alt', alt: 'alt', command: 'meta', cmd: 'meta', meta: 'meta', shift: 'shift' }[normalized];
                if (modifier) {
                    modifiers.add(modifier);
                } else if (!baseKey) {
                    baseKey = normalized;
                } else {
                    return null;
                }
            }
            if (!baseKey || ['ctrl', 'alt', 'shift', 'meta'].includes(baseKey) || !this.isSupportedBaseKey(baseKey)) return null;
            const ordered = ['ctrl', 'alt', 'shift', 'meta'].filter(modifier => modifiers.has(modifier));
            return [...ordered, baseKey].join('+');
        }

        normalizeBaseKey(value) {
            const key = String(value || '').trim().toLowerCase();
            const aliases = {
                'return': 'enter', 'esc': 'escape', 'spacebar': 'space', ' ': 'space',
                'left': 'arrowleft', 'right': 'arrowright', 'up': 'arrowup', 'down': 'arrowdown',
                'pgup': 'pageup', 'pgdn': 'pagedown', 'del': 'delete'
            };
            return aliases[key] || key;
        }

        isSupportedBaseKey(key) {
            return String(key).length === 1 ||
                /^(?:f(?:[1-9]|1\d|2[0-4])|enter|escape|space|tab|home|end|pageup|pagedown|arrowleft|arrowright|arrowup|arrowdown|delete|backspace|insert)$/i.test(String(key));
        }

        formatShortcut(chords) {
            const names = {
                ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Meta', enter: 'Enter', escape: 'Escape',
                space: 'Space', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown',
                arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown',
                delete: 'Delete', backspace: 'Backspace', tab: 'Tab'
            };
            return chords.map(chord => chord.split('+').map(token => names[token] || token.toUpperCase()).join('+')).join(' then ');
        }

        chordFromEvent(event) {
            if (!event || ['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return null;
            const baseKey = this.normalizeBaseKey(event.key);
            if (!baseKey) return null;
            const modifiers = [];
            if (event.ctrlKey) modifiers.push('ctrl');
            if (event.altKey) modifiers.push('alt');
            if (event.shiftKey) modifiers.push('shift');
            if (event.metaKey) modifiers.push('meta');
            return [...modifiers, baseKey].join('+');
        }

        renderSidebar() {
            const previousCollapsed = this.isCollapsed;
            this.container?.remove();
            const container = document.createElement('div');
            container.className = 'aw-shortcuts-sidebar';
            container.dataset.awShortcutsRoot = 'true';
            container.setAttribute('role', 'region');
            container.setAttribute('aria-label', 'AdaptiveWeb keyboard shortcuts');

            const header = document.createElement('div');
            header.className = 'aw-shortcuts-header';
            const title = document.createElement('strong');
            title.textContent = 'Adaptive shortcuts';
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'aw-shortcuts-toggle';
            toggle.setAttribute('aria-label', 'Collapse shortcut help');
            toggle.textContent = '−';
            toggle.addEventListener('click', () => this.toggleSidebar());
            header.append(title, toggle);

            const list = document.createElement('div');
            list.className = 'aw-shortcuts-list';
            this.shortcuts.forEach((shortcut, index) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'aw-shortcut-item';
                item.dataset.shortcutIndex = String(index);
                item.setAttribute('aria-label', `${shortcut.key}: ${shortcut.action}`);
                const key = document.createElement('kbd');
                key.textContent = shortcut.key;
                const action = document.createElement('span');
                action.textContent = shortcut.action;
                item.append(key, action);
                item.addEventListener('click', () => this.executeShortcut(shortcut));
                list.appendChild(item);
            });

            const status = document.createElement('div');
            status.className = 'aw-shortcuts-status';
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            status.textContent = 'Ready';
            container.append(header, list, status);
            document.body.appendChild(container);
            this.container = container;
            this.statusElement = status;
            this.isCollapsed = previousCollapsed;
            this.toggleSidebar(previousCollapsed);
        }

        startListening() {
            if (this.startedListening) return;
            this.startedListening = true;
            this.boundKeydown = event => this.handleKeydown(event);
            window.addEventListener('keydown', this.boundKeydown, true);
            window.addEventListener('pagehide', () => this.destroy(), { once: true });
        }

        handleKeydown(event) {
            if (event.repeat || event.isComposing || this.container?.contains(event.target)) return false;
            const editable = this.isEditableTarget(event.target);
            if (editable && !event.ctrlKey && !event.altKey && !event.metaKey) {
                this.resetPendingSequence();
                return false;
            }
            const chord = this.chordFromEvent(event);
            if (!chord) return false;
            return this.consumeChord(chord, event);
        }

        isEditableTarget(target) {
            if (!target) return false;
            const tag = String(target.tagName || '').toUpperCase();
            return ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || Boolean(target.isContentEditable);
        }

        consumeChord(chord, event) {
            let next = [...this.pendingChords, chord];
            let matches = this.shortcuts.filter(shortcut => this.isSequencePrefix(next, shortcut.chords));
            if (matches.length === 0 && this.pendingChords.length > 0) {
                this.resetPendingSequence();
                next = [chord];
                matches = this.shortcuts.filter(shortcut => this.isSequencePrefix(next, shortcut.chords));
            }
            if (matches.length === 0) return false;

            event.preventDefault?.();
            event.stopPropagation?.();
            event.stopImmediatePropagation?.();
            const exact = matches.find(shortcut => shortcut.chords.length === next.length);
            const hasLonger = matches.some(shortcut => shortcut.chords.length > next.length);

            if (exact && !hasLonger) {
                this.resetPendingSequence();
                this.executeShortcut(exact);
                return true;
            }

            this.pendingChords = next;
            this.setStatus(`Waiting: ${this.formatShortcut(next)} …`);
            if (this.sequenceTimer) clearTimeout(this.sequenceTimer);
            this.sequenceTimer = setTimeout(() => {
                if (exact) this.executeShortcut(exact);
                else this.setStatus('Sequence timed out');
                this.resetPendingSequence(false);
            }, this.sequenceTimeout);
            return true;
        }

        isSequencePrefix(prefix, sequence) {
            return prefix.length <= sequence.length && prefix.every((chord, index) => chord === sequence[index]);
        }

        resetPendingSequence(clearStatus = true) {
            this.pendingChords = [];
            if (this.sequenceTimer) clearTimeout(this.sequenceTimer);
            this.sequenceTimer = null;
            if (clearStatus) this.setStatus('Ready');
        }

        executeShortcut(shortcut) {
            if (!shortcut) return false;
            this.resetPendingSequence(false);
            let succeeded = false;

            if (shortcut.actionType === 'scroll_top') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                succeeded = true;
            } else if (shortcut.actionType === 'scroll_bottom') {
                const bottom = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0);
                window.scrollTo({ top: bottom, behavior: 'smooth' });
                succeeded = true;
            } else if (shortcut.actionType === 'toggle_shortcuts') {
                this.toggleSidebar(!this.isCollapsed);
                succeeded = true;
            } else {
                const target = this.resolveTarget(shortcut);
                if (!target) {
                    this.setStatus(`Unavailable: ${shortcut.action}`);
                    return false;
                }
                target.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                target.focus?.({ preventScroll: true });
                this.highlightTarget(target);
                if (shortcut.actionType === 'activate') {
                    if (!this.isSafelyActivatable(target)) {
                        this.setStatus(`Focused safely: ${shortcut.action}`);
                        this.highlightShortcut(shortcut);
                        return true;
                    }
                    target.click?.();
                }
                succeeded = true;
            }

            if (succeeded) {
                this.highlightShortcut(shortcut);
                this.setStatus(`Done: ${shortcut.action}`);
                this.api?.log?.('shortcut_executed', {
                    key: shortcut.signature,
                    action_type: shortcut.actionType,
                    source: shortcut.source
                });
            }
            return succeeded;
        }

        resolveTarget(shortcut) {
            const stored = this.targetMap.get(shortcut.targetId);
            const wanted = String(shortcut.targetLabel || '').toLowerCase();
            if (stored?.isConnected && (!wanted || this.getTargetLabel(stored).toLowerCase() === wanted)) return stored;
            if (!wanted) return null;
            const current = this.collectPageActions().find(item => item.label.toLowerCase() === wanted);
            return current ? this.targetMap.get(current.targetId) : null;
        }

        isSafelyActivatable(target) {
            if (!target || target.disabled || target.getAttribute?.('aria-disabled') === 'true') return false;
            const tag = String(target.tagName || '').toUpperCase();
            const type = String(target.type || target.getAttribute?.('type') || '').toLowerCase();
            if ((tag === 'BUTTON' && (!type || type === 'submit') && target.closest?.('form')) ||
                (tag === 'INPUT' && ['submit', 'image', 'file'].includes(type))) return false;
            const href = String(target.getAttribute?.('href') || '');
            if (/^javascript:/i.test(href) || target.hasAttribute?.('download')) return false;
            const label = this.getTargetLabel(target);
            return !/\b(delete|remove|purchase|pay|checkout|buy|submit|send|publish|transfer|confirm|order|sign out|log out|unsubscribe|account|password)\b/i.test(label);
        }

        highlightTarget(target) {
            target.classList?.add('aw-shortcut-target-highlight');
            setTimeout(() => target.classList?.remove('aw-shortcut-target-highlight'), 1200);
        }

        highlightShortcut(shortcut) {
            const index = this.shortcuts.indexOf(shortcut);
            if (index < 0) return;
            const item = this.container?.querySelector(`[data-shortcut-index="${index}"]`);
            item?.classList.add('active');
            setTimeout(() => item?.classList.remove('active'), 450);
        }

        toggleSidebar(forceCollapsed) {
            this.isCollapsed = typeof forceCollapsed === 'boolean' ? forceCollapsed : !this.isCollapsed;
            this.container?.classList.toggle('is-collapsed', this.isCollapsed);
            const toggle = this.container?.querySelector('.aw-shortcuts-toggle');
            if (toggle) {
                toggle.textContent = this.isCollapsed ? '+' : '−';
                toggle.setAttribute('aria-label', this.isCollapsed ? 'Expand shortcut help' : 'Collapse shortcut help');
                toggle.setAttribute('aria-expanded', String(!this.isCollapsed));
            }
        }

        setStatus(message) {
            if (this.statusElement) this.statusElement.textContent = String(message || 'Ready');
        }

        destroy() {
            if (this.boundKeydown) window.removeEventListener('keydown', this.boundKeydown, true);
            this.resetPendingSequence(false);
            this.container?.remove();
            this.container = null;
        }
    }

    // Init
    console.log('AdaptiveWeb: Publisher Edition Active');
    const ui = new UIAdapter();
    const detector = new BehaviorDetector(ui);
    detector.initCursorHesitation();

    // Init Shortcuts
    new ShortcutsManager(new ApiService());

    window.AdaptiveWeb = true;

})();
