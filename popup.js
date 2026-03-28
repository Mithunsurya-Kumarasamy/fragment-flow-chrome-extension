document.addEventListener('DOMContentLoaded', () => {
    const statusBadge = document.getElementById('status-badge');
    const fileNameEl = document.getElementById('file-name');
    const globalStatsEl = document.getElementById('global-stats');
    const globalProgress = document.getElementById('global-progress');
    const globalSpeedEl = document.getElementById('global-speed');
    const globalPercentEl = document.getElementById('global-percent');
    const threadsContainer = document.getElementById('threads-container');
    const threadCountEl = document.getElementById('thread-count');
    const noThreadsMsg = document.getElementById('no-threads-msg');
    const actionBtn = document.getElementById('action-btn');
    const stopBtn = document.getElementById('stop-btn');
    
    // Swarm UI elements
    const swarmCard = document.getElementById('swarm-card');
    const peerCountBadge = document.getElementById('peer-count');
    const swarmConnectedPeers = document.getElementById('swarm-connected-peers');
    const swarmLocalChunks = document.getElementById('swarm-local-chunks');
    const swarmTotalChunks = document.getElementById('swarm-total-chunks');

    // ==================== BANDWIDTH UI ELEMENTS ====================
    const bandwidthCard = document.getElementById('bandwidth-card');
    const bandwidthBadge = document.getElementById('bandwidth-badge');
    const bandwidthValue = document.getElementById('bandwidth-value');
    const adaptiveThreads = document.getElementById('adaptive-threads');
    const chunkSize = document.getElementById('chunk-size');

    let threadElements = {};
    let isPaused = false;
    let swarmStatsInterval = null;
    let uiInitialized = false; // Track if download UI has been initialized
    let blockAccumulatedMB = [0, 0, 0, 0];
    let previousThreadMB = {};

    // Handle Pause/Resume clicks
    actionBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        if (isPaused) {
            chrome.runtime.sendMessage({ action: "pause" });
            setUIPaused();
        } else {
            chrome.runtime.sendMessage({ action: "resume" });
            setUIResumed();
        }
    });

    // Handle Stop click - completely halt the download
    stopBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: "stop" });
        statusBadge.innerText = "Stopped";
        statusBadge.className = "badge bg-danger text-white";
        actionBtn.style.display = 'none';
        stopBtn.style.display = 'none';
        fileNameEl.innerText = "Download stopped";
        globalSpeedEl.innerText = "0 KB/s";
        uiInitialized = false; // Reset for next download
        
        // Stop swarm stats polling
        if (swarmStatsInterval) {
            clearInterval(swarmStatsInterval);
            swarmStatsInterval = null;
        }
        swarmCard.style.display = 'none';
        bandwidthCard.style.display = 'none';
    });

    function setUIPaused() {
        actionBtn.innerText = "Resume";
        actionBtn.classList.replace('text-primary', 'text-success');
        statusBadge.innerText = "Paused";
        statusBadge.classList.replace('text-success', 'text-warning');
        globalSpeedEl.innerText = "0 KB/s";
    }

    function setUIResumed() {
        actionBtn.innerText = "Pause";
        actionBtn.classList.replace('text-success', 'text-primary');
        statusBadge.innerText = "Downloading";
        statusBadge.classList.replace('text-warning', 'text-success');
    }

    function initDownloadUI(fileName, totalMB, numThreads) {
        statusBadge.innerText = "Downloading";
        statusBadge.classList.replace('text-primary', 'text-success');
        actionBtn.style.display = 'inline-block'; // Show the button
        stopBtn.style.display = 'inline-block'; // Show stop button
        fileNameEl.innerText = fileName || "fragment_download.bin";
        globalStatsEl.innerText = `0.00 / ${totalMB.toFixed(2)} MB`;
        threadCountEl.innerText = numThreads;
        
        for (let i = 1; i <= 4; i++) {
            let bar = document.getElementById(`block-${i}`);
            if (bar) {
                bar.style.width = `0%`;
                bar.classList.replace('bg-success', 'bg-info');
            }
        }
        
        uiInitialized = true;
        
        // ==================== SWARM: Start polling swarm stats ====================
        startSwarmStatsPoll();
    }
    
    // ==================== SWARM FUNCTIONS ====================
    function startSwarmStatsPoll() {
        if (swarmStatsInterval) clearInterval(swarmStatsInterval);
        
        // Poll swarm stats every 2 seconds
        swarmStatsInterval = setInterval(() => {
            chrome.runtime.sendMessage({ action: "getSwarmStats" }, (response) => {
                if (!chrome.runtime.lastError && response) {
                    updateSwarmUI(response);
                }
            });
        }, 2000);
        
        // Fetch immediately
        chrome.runtime.sendMessage({ action: "getSwarmStats" }, (response) => {
            if (!chrome.runtime.lastError && response) {
                updateSwarmUI(response);
            }
        });
    }
    
    function updateSwarmUI(swarmStats) {
        // Check if swarm is enabled
        const swarmEnabled = swarmStats.swarmEnabled !== false;
        
        if (!swarmEnabled || swarmStats.connectedPeers === 0) {
            // Hide swarm card if no peers connected
            if (swarmStats.connectedPeers === 0) {
                swarmCard.style.display = 'none';
            }
            return;
        }
        
        // Show swarm card if peers are connected
        swarmCard.style.display = 'block';
        
        // Update swarm stats
        const connectedPeers = swarmStats.connectedPeers || 0;
        const localChunks = swarmStats.localChunks || 0;
        const totalChunks = swarmStats.totalChunksInSwarm || 0;
        
        peerCountBadge.innerText = `${connectedPeers} peer${connectedPeers !== 1 ? 's' : ''}`;
        swarmConnectedPeers.innerText = connectedPeers;
        swarmLocalChunks.innerText = localChunks;
        swarmTotalChunks.innerText = totalChunks;
        
        // Change color based on network health
        if (connectedPeers > 0) {
            peerCountBadge.className = 'badge bg-success';
        }
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === "downloadInfo") {
            if (message.supported && !uiInitialized) {
                initDownloadUI("Target File", parseFloat(message.sizeMB), message.threads);
            }
        } 
        else if (message.action === "updateProgress") {
            // Auto-initialize UI if not already done (for fast initial broadcast)
            if (!uiInitialized && message.globalTotalMB && message.activeThreads) {
                initDownloadUI("Target File", parseFloat(message.globalTotalMB), message.activeThreads);
            }

            globalProgress.style.width = `${message.globalPercent}%`;
            globalPercentEl.innerText = `${message.globalPercent}%`;
            globalSpeedEl.innerText = message.speed || "0 KB/s";
            
            // Display file size with proper formatting
            const downloadedMB = parseFloat(message.globalDownloadedMB).toFixed(2);
            const totalMB = typeof message.globalTotalMB === 'string' 
                ? message.globalTotalMB 
                : parseFloat(message.globalTotalMB).toFixed(2);
            globalStatsEl.innerText = `${downloadedMB} / ${totalMB} MB`;

            // ==================== BANDWIDTH DISPLAY ====================
            if (message.bandwidth) {
                bandwidthCard.style.display = 'block';
                
                if (message.bandwidth === "--") {
                    bandwidthValue.innerText = "Measuring...";
                    bandwidthBadge.innerText = "Measuring";
                    bandwidthBadge.className = 'badge bg-secondary';
                } else {
                    const mbps = parseFloat(message.bandwidth);
                    bandwidthValue.innerText = `${message.bandwidth} Mbps`;
                    bandwidthBadge.innerText = `${message.bandwidth} Mbps`;
                    
                    // Update badge color based on bandwidth
                    if (mbps < 5) {
                        bandwidthBadge.className = 'badge bg-danger';
                    } else if (mbps < 25) {
                        bandwidthBadge.className = 'badge bg-warning';
                    } else if (mbps < 100) {
                        bandwidthBadge.className = 'badge bg-info';
                    } else {
                        bandwidthBadge.className = 'badge bg-success';
                    }
                }
            }

            // Update active thread count if changed
            if (message.activeThreads) {
                adaptiveThreads.innerText = message.activeThreads;
                threadCountEl.innerText = message.activeThreads;
            }

            // Display chunk count if available
            if (message.chunkCount !== undefined) {
                // Can be used for debug info if needed
                console.log(`Chunks remaining: ${message.chunkCount}`);
            }

            // Delta Accumulation Logic for the 4 Blocks
            if (message.threadsData && message.globalTotalMB > 0) {
                // If the popup was opened mid-download, seed the array
                let totalTracked = blockAccumulatedMB.reduce((a, b) => a + b, 0);
                if (totalTracked === 0 && message.globalDownloadedMB > 0) {
                    let baseline = parseFloat(message.globalDownloadedMB) / 4;
                    blockAccumulatedMB = [baseline, baseline, baseline, baseline];
                    message.threadsData.forEach(t => {
                        previousThreadMB[t.id] = parseFloat(t.downloadedMB) || 0;
                    });
                }

                // Process active chunks
                message.threadsData.forEach(thread => {
                    let prev = previousThreadMB[thread.id] || 0;
                    let curr = parseFloat(thread.downloadedMB) || 0;
                    
                    // If current is less than previous, thread picked up a new chunk.
                    let delta = curr < prev ? curr : curr - prev;
                    previousThreadMB[thread.id] = curr;

                    if (delta > 0) {
                        // Distribute the delta to the block that is trailing behind
                        let minIndex = 0;
                        for (let i = 1; i < 4; i++) {
                            if (blockAccumulatedMB[i] < blockAccumulatedMB[minIndex]) {
                                minIndex = i;
                            }
                        }
                        blockAccumulatedMB[minIndex] += delta;
                    }
                });

                // Update the DOM for the 4 static blocks
                let expectedPerBlock = parseFloat(message.globalTotalMB) / 4;
                for (let i = 0; i < 4; i++) {
                    let percent = expectedPerBlock > 0 ? (blockAccumulatedMB[i] / expectedPerBlock) * 100 : 0;
                    percent = Math.min(100, percent); // Cap at 100%

                    let bar = document.getElementById(`block-${i+1}`);
                    if (bar) {
                        bar.style.width = `${percent}%`;
                        if (percent >= 100) {
                            bar.classList.replace('bg-info', 'bg-success');
                        }
                    }
                }
            }
        }
        else if (message.action === "threadCountUpdated") {
            // Handle thread rebalancing notification
            console.log(`Thread count updated to ${message.threads} (${message.bandwidth} Mbps)`);
            adaptiveThreads.innerText = message.threads;
            threadCountEl.innerText = message.threads;
            
            // Flash the badge to indicate change
            threadCountEl.style.animation = 'none';
            setTimeout(() => {
                threadCountEl.style.animation = 'pulse 0.5s';
            }, 10);
        }
        else if (message.action === "downloadComplete") {
            statusBadge.innerText = "Downloaded";
            statusBadge.className = "badge bg-success text-white";
            actionBtn.style.display = 'none'; 
            fileNameEl.innerText = "Download Complete!";
            globalProgress.style.width = "100%";
            globalPercentEl.innerText = "100%";
            globalSpeedEl.innerText = "0 KB/s";
            uiInitialized = false; // Reset for next download
            
            // Display final file size
            const totalMB = parseFloat(message.totalMB) || 0;
            const downloadedMB = parseFloat(message.downloadedMB) || 0;
            globalStatsEl.innerText = `${downloadedMB.toFixed(2)} / ${totalMB.toFixed(2)} MB`;

            for (let i = 1; i <= 4; i++) {
                let bar = document.getElementById(`block-${i}`);
                if (bar) {
                    bar.style.width = `100%`;
                    bar.classList.replace('bg-info', 'bg-success');
                }
            }
            
            // Stop swarm stats polling
            if (swarmStatsInterval) {
                clearInterval(swarmStatsInterval);
                swarmStatsInterval = null;
            }
            swarmCard.style.display = 'none';
            bandwidthCard.style.display = 'none';
        }
    });

    chrome.runtime.sendMessage({ action: "getStatus" }, (response) => {
        if (!chrome.runtime.lastError && response) {
            if (response.downloadCompleted) {
                statusBadge.innerText = "Downloaded";
                statusBadge.className = "badge bg-success text-white";
                actionBtn.style.display = 'none';
                fileNameEl.innerText = "✓ Download Complete!";
                globalProgress.style.width = "100%";
                globalPercentEl.innerText = "100%";

                for (let i = 1; i <= 4; i++) {
                    let bar = document.getElementById(`block-${i}`);
                    if (bar) {
                        bar.style.width = `100%`;
                        bar.classList.replace('bg-info', 'bg-success');
                    }
                }

            } else if (response.isDownloading) {
                 actionBtn.style.display = 'inline-block';
                 if (response.isPaused) {
                     isPaused = true;
                     setUIPaused();
                 }
                 // Start swarm stats polling
                 startSwarmStatsPoll();
            }
        }
    });
});