import sac from 'https://dev.jspm.io/npm:standardized-audio-context';

/*
 * Refs:
 * https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_Web_Audio_API
 * https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement
 * https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource
 * https://developer.mozilla.org/en-US/docs/Web/API/MediaSource/MediaSource
 * https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext
 *
 * https://addyosmani.com/resources/essentialjsdesignpatterns/book/#modulepatternjavascript
 *
 * view-source:https://googlechromelabs.github.io/web-audio-samples/archive/demos/visualizer-gl.html
 */

const visSound = (function () {
    /*
     * Variables
     */

    const currentAudioFiles = [];
    let totalCountElement = null;
    let totalSizeElement = null;
    let dragDropFilesElement = null;
    let selectFilesElement = null;
    let audioResetButtonElement = null;
    let audioOfflineButtonElement = null;

    let audioElement = null;
    let audioContext = null;
    let audioContextOffline = null;
    let audioSourceNode = null;
    let audioAnalyserNode = null;
    let canvasDrawings = {};
    let canvasDrawingFrameRealtime = null;
    let canvasDrawingFrameOffline = null;

    let audioBufferSourceOfflineNode = null;
    let audioAnalyserOfflineNode = null;

    const VIS_STYLE_WAVEFORM = 'waveform';
    const VIS_STYLE_FREQUENCY = 'frequency';
    const VIS_STYLE_SPECTROGRAM = 'spectrogram';
    const VIS_GEN_REALTIME = 'realtime';
    const VIS_GEN_OFFLINE = 'offline';

    // for spectrogram drawing
    let getColor = chroma.scale(['#000', '#666', '#aaa', '#fff'], [0, .25, .75, 1]).domain([0, 300]);
    let tempCanvas = document.createElement("canvas"),
        tempCtx = tempCanvas.getContext("2d");

    /*
     * Wrapper functions for Web Audio API items
     */

    /**
     * Create an audio context.
     * @returns {AudioContext}
     */
    function createAudioContext() {
        console.log("[Audio Experiment] Creating a new audio context.");
        return new sac.AudioContext();
    }

    /**
     * Create an offline audio context.
     * @param {BaseAudioContext} sourceAudioContext
     * @param {AudioNode} sourceAudioNode
     * @return {OfflineAudioContext}
     */
    function createOfflineAudioContext(sourceAudioContext, sourceAudioNode) {
        let channels = sourceAudioNode.channelCount;
        let sampleRate = sourceAudioContext.sampleRate;

        // An integer representing the size of the buffer in sample-frames.

        // An integer specifying the size of the buffer to create for the audio context, in sample-frames,
        // where one sample-frame is a unit that can contain a single sample of audio data for every channel
        // in the audio data. For example, a 5-second buffer with a sampleRate of 48000Hz would have
        // a length of 5 * 48000 = 240000 sample-frames.
        const seconds = 5;
        let bufferLength = sampleRate * channels * seconds;

        console.log("[Audio Experiment] Creating a new offline audio context.");
        return new sac.OfflineAudioContext(channels, bufferLength, sampleRate);
    }

    /*
     * Functions - DO NOT reference private vars in these
     */

    /**
     *
     * @param audioElement
     * @param files
     * @return void
     */
    function setAudioElementSource(audioElement, files) {
        if (files && files.length > 0) {
            let file = files[0];
            console.log(`[Audio Experiment] Only using first file ${file} of ${files.length} files.`);

            if (!file || !(file instanceof File)) {
                console.warn(`[Audio Experiment] Not a recognised audio file '${file}'.`);
                return;
            }

            file.objectUrl = window.URL.createObjectURL(file);
            audioElement.src = file.objectUrl;
        } else {
            console.warn("[Audio Experiment] No audio files available.");
        }
    }

    /**
     *
     * @param audioElement
     * @return void
     */
    function clearAudioElementSource(audioElement) {
        audioElement.src = null;
        console.log("[Audio Experiment] Cleared audio element src.");
    }

    /**
     * Filter files to only audio files.
     * @param files
     * @returns {[]}
     */
    function filterFiles(files) {
        let result = [];
        for (let i = 0; i < files.length; i++) {
            let file = files[i];
            if (!file.type.startsWith("audio/")) {
                console.warn(`[Audio Experiment] Selected file '${file.name}' (${file.type}) is not an audio file.`);
                continue;
            }
            result.push(file);
            console.log(`[Audio Experiment] Included new audio file '${file.name}'.`);
        }
        return result;
    }

    /**
     * Update the file metrics display.
     * @param files
     * @param targetTotalCountElement
     * @param targetTotalSizeElement
     */
    function updateFileDisplay(files, targetTotalCountElement, targetTotalSizeElement) {
        let byteCount = 0;
        for (let i = 0; i < files.length; i++) {
            let file = files[i];
            byteCount += file.size;
        }

        let fileSizeText = byteCount + " bytes";
        for (let aMultiples = ["KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"],
                 nMultiple = 0,
                 nApprox = byteCount / 1024; nApprox > 1; nApprox /= 1024, nMultiple++) {
            fileSizeText = nApprox.toFixed(3) + " " + aMultiples[nMultiple] + " (" + byteCount + " bytes)";
        }
        if (targetTotalCountElement) {
            targetTotalCountElement.innerHTML = files.length.toString();
        }
        if (targetTotalSizeElement) {
            targetTotalSizeElement.innerHTML = fileSizeText;
        }

        console.log("[Audio Experiment] Updated file total display.");
    }

    /**
     *
     * @param currentFiles
     * @param newFiles
     * @returns {[]}
     */
    function addCurrentAudioFiles(currentFiles, newFiles) {
        for (let i = 0; i < newFiles.length; i++) {
            let file = newFiles[i];
            if (currentFiles.find(element => element.name === file.name)) {
                console.warn(`[Audio Experiment] Selected file '${file.name}' (${file.type}) has already been added.`);
                continue;
            }
            console.log(`[Audio Experiment] Added audio file '${file.name}'.`);
            currentFiles.push(file);
        }
        return currentFiles;
    }

    /**
     *
     * @param currentFiles
     * @return void
     */
    function clearCurrentAudioFiles(currentFiles) {
        currentFiles.length = 0;
        console.log("[Audio Experiment] Cleared current audio files.");
    }

    /*
     * Functions - event handlers
     */

    /**
     * Fired when playback stops when end of the media (<audio> or <video>) is reached or because no further
     * data is available.
     * @param {Event} event
     * @return void
     */
    function audioElementEndedHandler(event) {
        console.log("[Audio Experiment] Event audioElementEndedHandler");
        cancelRealtimeDraw();
    }

    /**
     * Fired when the paused property is changed from true to false, as a result of the HTMLMediaElement.play() method,
     * or the autoplay attribute
     * @param {Event} event
     * @return void
     */
    function audioElementPlayHandler(event) {
        console.log("[Audio Experiment] Event audioElementPlayHandler");
        beginRealtimeDraw();
    }

    /**
     * Fired when a request to pause play is handled and the activity has entered its paused state, most commonly
     * occurring when the media's HTMLMediaElement.pause() method is called.
     * @param {Event} event
     * @return void
     */
    function audioElementPauseHandler(event) {
        console.log("[Audio Experiment] Event audioElementPauseHandler");
        cancelRealtimeDraw();
    }

    /**
     * Fired when the media has become empty; for example, when the media has already been loaded (or partially loaded),
     * and the HTMLMediaElement.load() method is called to reload it.
     * @param {Event} event
     * @return void
     */
    function audioElementEmptiedHandler(event) {
        console.log("[Audio Experiment] Event audioElementEmptiedHandler");
        cancelRealtimeDraw();
    }

    /**
     * Fired when playback is ready to start after having been paused or delayed due to lack of data
     * @param {Event} event
     * @return void
     */
    function audioElementPlayingHandler(event) {
        console.log("[Audio Experiment] Event audioElementPlayingHandler");
    }

    /**
     *
     * @param {Event} event
     * @return void
     */
    function audioContextStateChangeHandler(event) {
        console.log("[Audio Experiment] Event audioContextStateChangeHandler", event);
        console.log(`[Audio Experiment] Audio Context state: '${audioContext.state}'; Offline Audio Context state: '${audioContextOffline.state}'.`);
    }

    /**
     *
     * @param {DragEvent} event
     * @return void
     */
    function selectFilesBoxDragenterHandler(event) {
        console.log("[Audio Experiment] Event selectFilesBoxDragenterHandler");
        event.stopPropagation();
        event.preventDefault();
    }

    /**
     *
     * @param {DragEvent} event
     * @return void
     */
    function selectFilesBoxDragoverHandler(event) {
        console.log("[Audio Experiment] Event selectFilesBoxDragoverHandler");
        event.stopPropagation();
        event.preventDefault();
    }

    /**
     *
     * @param {DragEvent} event
     * @return void
     */
    function selectFilesBoxDropHandler(event) {
        console.log("[Audio Experiment] Event selectFilesBoxDropHandler");
        event.stopPropagation();
        event.preventDefault();
        handleFiles(event.dataTransfer.files);
    }

    /**
     *
     * @param {Event} event
     * @return void
     */
    function selectFilesInputChangeHandler(event) {
        console.log("[Audio Experiment] Event selectFilesInputChangeHandler");
        handleFiles(event.target.files);
    }

    /**
     *
     * @param {Event} event
     * @return void
     */
    function selectFilesInputClickHandler(event) {
        console.log("[Audio Experiment] Event selectFilesInputClickHandler");
    }

    /**
     *
     * @param {Event} event
     * @return void
     */
    function audioResetButtonClickHandler(event) {
        console.log("[Audio Experiment] Event audioResetButtonClickHandler");
        clearFiles();
    }

    /**
     *
     * @param {Event} event
     * @return void
     */
    function audioOfflineButtonClickHandler(event) {
        console.log("[Audio Experiment] Event audioOfflineButtonClickHandler");
        beginOfflineDraw();
    }

    /**
     *
     * @param {OfflineAudioCompletionEvent} event
     * @return void
     */
    function audioContextOfflineCompleteHandler(event) {
        console.log("[Audio Experiment] Event audioContextOfflineCompleteHandler");
    }

    /*
     * visualisation draw functions
     */

    /**
     * Draw a waveform.
     * @param {HTMLCanvasElement} canvas
     * @param {CanvasRenderingContext2D} ctx
     * @param {Uint8Array} dataArray
     * @return void
     */
    function drawWaveform(canvas, ctx, dataArray) {
        // See https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API
        // See https://github.com/mdn/voice-change-o-matic/blob/gh-pages/scripts/app.js#L123-L167

        let bufferLength = dataArray.length;

        // fill the canvas with a solid colour to start
        ctx.fillStyle = 'rgb(200, 200, 200)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Set a line width and stroke colour for the wave we will draw, then begin drawing a path
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgb(0, 0, 0)';
        ctx.beginPath();

        // Determine the width of each segment of the line to be drawn by dividing the canvas width by the array length
        // (equal to the FrequencyBinCount, as defined earlier on), then define an x variable to define the position to
        // move to for drawing each segment of the line.
        let sliceWidth = canvas.width / bufferLength;
        let x = 0;

        // run through a loop, defining the position of a small segment of the wave for each point in the buffer at a
        // certain height based on the data point value form the array, then moving the line across to the place where
        // the next wave segment should be drawn.
        for (let i = 0; i < bufferLength; i++) {

            let v = dataArray[i] / 128.0;
            let y = v * canvas.height / 2;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        // finish the line in the middle of the right hand side of the canvas, then draw the stroke we've defined.
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
    }

    /**
     * Draw a frequency bar chart.
     * @param {HTMLCanvasElement} canvas
     * @param {CanvasRenderingContext2D} ctx
     * @param {Uint8Array} dataArray
     * @return void
     */
    function drawFrequency(canvas, ctx, dataArray) {
        // Another nice little sound visualization to create is one of those Winamp-style frequency bar graphs.
        let bufferLength = dataArray.length;

        ctx.fillStyle = 'rgb(0, 0, 0)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Now we set our barWidth to be equal to the canvas width divided by the number of bars (the buffer length).
        // However, we are also multiplying that width by 2.5, because most of the frequencies will come back as having
        // no audio in them, as most of the sounds we hear every day are in a certain lower frequency range. We don't
        // want to display loads of empty bars, therefore we simply shift the ones that will display regularly at a
        // noticeable height across so they fill the canvas display.
        //
        // We also set a barHeight variable, and an x variable to record how far across the screen to draw the current bar.
        let barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        // we now start a for loop and cycle through each value in the dataArray. For each one, we make the barHeight equal
        // to the array value, set a fill colour based on the barHeight (taller bars are brighter), and draw a bar at
        // x pixels across the canvas, which is barWidth wide and barHeight/2 tall (we eventually decided to cut each bar
        // in half so they would all fit on the canvas better.)
        //
        // The one value that needs explaining is the vertical offset position we are drawing each bar
        // at: HEIGHT-barHeight/2. I am doing this because I want each bar to stick up from the bottom of the canvas,
        // not down from the top, as it would if we set the vertical position to 0. Therefore, we instead set the
        // vertical position each time to the height of the canvas minus barHeight/2, so therefore each bar will be
        // drawn from partway down the canvas, down to the bottom.
        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 2;

            ctx.fillStyle = 'rgb(' + (barHeight + 100) + ',50,50)';
            ctx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight);

            x += barWidth + 1;
        }
    }

    /**
     *
     * @param array
     * @return {number[]}
     */
    function getLandmarks(array) {
        let recordPoints = [0, 0, 0, 0, 0];
        let highScores = [0, 0, 0, 0, 0];
        let RANGE = [40, 80, 120, 180, 300];
        for (let i = 0; i < array.length; i++) {
            let magnitude = Math.log(Math.abs(array[i]) + 1);

            let indexPoint = 0;
            while (RANGE[i] < array[i]) i++;
            let index = indexPoint;

            if (magnitude > highScores[index]) {
                highScores[index] = magnitude;
                recordPoints[index] = array[i];
            }
        }
        return recordPoints;
    }

    /**
     * Draw a spectrogram.
     * @param {HTMLCanvasElement} canvas
     * @param {CanvasRenderingContext2D} ctx
     * @param {Uint8Array} dataArray
     * @return void
     */
    function drawSpectrogram(canvas, ctx, dataArray) {
        let bufferLength = dataArray.length;
        let width = canvas.width;
        let height = canvas.height;

        tempCanvas.width = width;
        tempCanvas.height = height;

        // copy the current canvas onto the temp canvas
        tempCtx.drawImage(canvas, 0, 0, width, height);
        for (let i = 0; i < bufferLength; i++) {
            ctx.fillStyle = getColor(dataArray[i]).hex();
            ctx.fillRect(width - 1, height - i, 1, 1);
        }

        let landmarks = getLandmarks(dataArray);
        for (let i = 0; i < landmarks.length; i++) {
            ctx.fillStyle = 'rgb(100, 200, 255)';
            ctx.fillRect(width - 1, height - landmarks[i], 1, 1);
        }

        // set translate on the canvas
        ctx.translate(-1, 0);

        // draw the copied image
        ctx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, width, height);

        // reset the transformation matrix
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /*
     * Functions - okay to reference private vars in these
     */

    /**
     * Handle files selected via drag and drop or file input element.
     * @param {FileList} files
     * @returns void
     */
    function handleFiles(files) {
        let theAudioElement = audioElement;
        let theCurrentAudioFiles = currentAudioFiles;
        let theTotalCountElement = totalCountElement;
        let theTotalSizeElement = totalSizeElement;

        let audioFiles = filterFiles(files);
        let availableFiles = addCurrentAudioFiles(theCurrentAudioFiles, audioFiles);
        setAudioElementSource(theAudioElement, availableFiles);
        updateFileDisplay(availableFiles, theTotalCountElement, theTotalSizeElement);

        console.log(`[Audio Experiment] Added ${audioFiles.length} files, now ${availableFiles.length} files.`);
    }

    /**
     * Clear all audio files.
     * @return void
     */
    function clearFiles() {
        let theAudioElement = audioElement;
        let theCurrentAudioFiles = currentAudioFiles;
        let theTotalCountElement = totalCountElement;
        let theTotalSizeElement = totalSizeElement;

        theAudioElement.pause();
        clearAudioElementSource(theAudioElement);
        clearCurrentAudioFiles(theCurrentAudioFiles);
        selectFilesElement.value = '';
        updateFileDisplay(theCurrentAudioFiles, theTotalCountElement, theTotalSizeElement);

        console.log("[Audio Experiment] All audio files cleared.");
    }

    /**
     *
     * @param bufferArray
     * @param visGenerationType
     */
    function doDraw(bufferArray, visGenerationType) {
        // loop through each canvas drawing function
        for (const canvasDrawerId in canvasDrawings) {
            let canvasDrawer = canvasDrawings[canvasDrawerId];
            let canvasElement = canvasDrawer['canvasElement'];
            let canvasContext = canvasDrawer['canvasContext'];
            let visStyle = canvasDrawer['visStyle'];
            let visGeneration = canvasDrawer['visGeneration'];

            if (visGeneration === visGenerationType) {
                visStyle(canvasElement, canvasContext, bufferArray);
            }
        }
    }

    /**
     *
     * @param {DOMHighResTimeStamp} timestamp
     */
    function beginRealtimeDraw(timestamp = null) {
        // use requestAnimationFrame() to keep looping the drawing function once it has been started
        canvasDrawingFrameRealtime = requestAnimationFrame(beginRealtimeDraw);

        // grab the time domain data and copy it into our array
        let audioAnalyserBuffer = new Uint8Array(audioAnalyserNode.frequencyBinCount);
        audioAnalyserNode.getByteTimeDomainData(audioAnalyserBuffer);

        doDraw(audioAnalyserBuffer, VIS_GEN_REALTIME);

    }

    /**
     * @return void
     */
    function cancelRealtimeDraw() {
        window.cancelAnimationFrame(canvasDrawingFrameRealtime);
    }

    /**
     *
     * @param {DOMHighResTimeStamp} timestamp
     * @return void
     */
    function beginOfflineDraw(timestamp = null) {
        // use requestAnimationFrame() to keep looping the drawing function once it has been started
        canvasDrawingFrameOffline = requestAnimationFrame(beginOfflineDraw);

        // grab the time domain data and copy it into our array
        let audioAnalyserBuffer = new Uint8Array(audioAnalyserOfflineNode.frequencyBinCount);
        audioAnalyserOfflineNode.getByteTimeDomainData(audioAnalyserBuffer);

        doDraw(audioAnalyserBuffer, VIS_GEN_OFFLINE);

        // TODO - how to use OfflineAudioContext to render a full spectrogram of an audio file?
        // audioBufferSourceNode.start();
        // audioContextOffline.startRendering();
    }

    /*
     * Init variables and event handlers
     */

    /**
     *
     * @param {String} totalCountId
     * @param {String} totalSizeId
     * @return void
     */
    function initFileDisplay(totalCountId, totalSizeId) {
        totalCountElement = document.getElementById(totalCountId);
        totalSizeElement = document.getElementById(totalSizeId);
    }

    /**
     *
     * @param {String} targetId
     * @return void
     */
    function initDragDrop(targetId) {
        dragDropFilesElement = document.getElementById(targetId);
        dragDropFilesElement.addEventListener("dragenter", selectFilesBoxDragenterHandler, false);
        dragDropFilesElement.addEventListener("dragover", selectFilesBoxDragoverHandler, false);
        dragDropFilesElement.addEventListener("drop", selectFilesBoxDropHandler, false);
    }

    /**
     *
     * @param {String} targetId
     * @return void
     */
    function initFileInput(targetId) {
        selectFilesElement = document.getElementById(targetId);
        selectFilesElement.addEventListener("click", selectFilesInputClickHandler, false);
        selectFilesElement.addEventListener("change", selectFilesInputChangeHandler, false);
    }

    /**
     *
     * @param {String} targetId
     * @return void
     */
    function initAudioElement(targetId) {
        audioElement = document.getElementById(targetId);
        audioElement.addEventListener('ended', audioElementEndedHandler, false);
        audioElement.addEventListener('play', audioElementPlayHandler, false);
        audioElement.addEventListener('pause', audioElementPauseHandler, false);
        audioElement.addEventListener('emptied', audioElementEmptiedHandler, false);
        audioElement.addEventListener('playing', audioElementPlayingHandler, false);

        // realtime
        audioContext = createAudioContext();
        audioContext.addEventListener('statechange', audioContextStateChangeHandler, false);

        audioSourceNode = audioContext.createMediaElementSource(audioElement);
        audioSourceNode.connect(audioContext.destination);

        audioAnalyserNode = audioContext.createAnalyser();
        audioAnalyserNode.fftSize = 2048;
        audioSourceNode.connect(audioAnalyserNode);

        // Offline (offline)
        audioContextOffline = createOfflineAudioContext(audioContext, audioSourceNode);
        audioContextOffline.addEventListener('complete', audioContextOfflineCompleteHandler, false);
        audioContextOffline.addEventListener('statechange', audioContextStateChangeHandler, false);

        audioBufferSourceOfflineNode = audioContextOffline.createBufferSource();
        audioBufferSourceOfflineNode.connect(audioContextOffline.destination);

        audioAnalyserOfflineNode = audioContextOffline.createAnalyser();
        audioAnalyserOfflineNode.fftSize = 2048;
        audioBufferSourceOfflineNode.connect(audioAnalyserOfflineNode);
    }

    /**
     *
     * @param {String} targetId
     * @return void
     */
    function initAudioReset(targetId) {
        audioResetButtonElement = document.getElementById(targetId);
        audioResetButtonElement.addEventListener("click", audioResetButtonClickHandler, false);
    }

    /**
     *
     * @param {String} targetId
     * @return void
     */
    function initAudioOffline(targetId) {
        audioOfflineButtonElement = document.getElementById(targetId);
        audioOfflineButtonElement.addEventListener("click", audioOfflineButtonClickHandler, false);
    }

    /**
     *
     * @param {String} targetId
     * @param {String} visStyle
     * @param {String} visGeneration
     * @return void
     */
    function initAudioCanvas(targetId, visStyle, visGeneration) {
        if (Object.keys(canvasDrawings).indexOf(targetId) > -1) {
            throw new Error(`Already have a canvas drawing named '${targetId}'.`);
        }

        let canvasElement = document.getElementById(targetId);
        let canvasContext = canvasElement.getContext('2d');

        canvasContext.clearRect(0, 0, canvasElement.width, canvasElement.height);

        let visStyleFunction = null;
        switch (visStyle) {
            case 'waveform':
                visStyleFunction = drawWaveform;
                break;
            case 'frequency':
                visStyleFunction = drawFrequency;
                break;
            case 'spectrogram':
                visStyleFunction = drawSpectrogram;
                break;
            default:
                throw new Error(`Unrecognised visualisation style '${visStyle}'.`)
        }

        console.log(`[Audio Experiment] Adding a canvas drawing step named '${targetId}'.`);

        canvasDrawings[targetId] = {
            'canvasElement': canvasElement,
            'canvasContext': canvasContext,
            'visStyle': visStyleFunction,
            'visGeneration': visGeneration,
        }
    }

    /**
     *
     * @return void
     */
    function initVariableControl() {
        let gui = new dat.GUI();
        let f1 = gui.addFolder('Analyser');
        f1.open();
        f1.add(audioAnalyserNode, 'minDecibels', -100, 0);
        f1.add(audioAnalyserNode, 'maxDecibels', -100, 0);
        f1.add(audioAnalyserNode, 'smoothingTimeConstant', 0, 1).step(0.01);
        f1.add(audioAnalyserNode, 'fftSize', [32, 64, 128, 256, 512, 1024, 2048]);

        let f2 = gui.addFolder('Analyser (Offline)');
        f2.open();
        f2.add(audioAnalyserOfflineNode, 'minDecibels', -100, 0);
        f2.add(audioAnalyserOfflineNode, 'maxDecibels', -100, 0);
        f2.add(audioAnalyserOfflineNode, 'smoothingTimeConstant', 0, 1).step(0.01);
        f2.add(audioAnalyserOfflineNode, 'fftSize', [32, 64, 128, 256, 512, 1024, 2048]);

        console.log("[Audio Experiment] Created variable changer.");
    }

    return {
        VIS_STYLE_WAVEFORM: VIS_STYLE_WAVEFORM,
        VIS_STYLE_FREQUENCY: VIS_STYLE_FREQUENCY,
        VIS_STYLE_SPECTROGRAM: VIS_STYLE_SPECTROGRAM,
        VIS_GEN_REALTIME: VIS_GEN_REALTIME,
        VIS_GEN_OFFLINE: VIS_GEN_OFFLINE,
        initFileDisplay: initFileDisplay,
        initDragDrop: initDragDrop,
        initFileInput: initFileInput,
        initAudioElement: initAudioElement,
        initAudioReset: initAudioReset,
        initAudioOffline: initAudioOffline,
        initAudioCanvas: initAudioCanvas,
        initVariableControl: initVariableControl,
    };

})();

/*
 * Init Page
 */

visSound.initFileDisplay('selectFilesTotalCount', 'selectFilesTotalSize');
visSound.initDragDrop('selectFilesBox');
visSound.initFileInput('selectFilesInput');
visSound.initAudioElement('audioElement');
visSound.initAudioReset('audioResetButton');
visSound.initAudioOffline('audioOfflineButton');
visSound.initAudioCanvas('audioCanvasWaveformRealtime', visSound.VIS_STYLE_WAVEFORM, visSound.VIS_GEN_REALTIME);
visSound.initAudioCanvas('audioCanvasFrequencyRealtime', visSound.VIS_STYLE_FREQUENCY, visSound.VIS_GEN_REALTIME);
visSound.initAudioCanvas('audioCanvasSpectrogramRealtime', visSound.VIS_STYLE_SPECTROGRAM, visSound.VIS_GEN_REALTIME);
visSound.initAudioCanvas('audioCanvasSpectrogramOffline', visSound.VIS_STYLE_SPECTROGRAM, visSound.VIS_GEN_OFFLINE);
visSound.initVariableControl();

console.log("[Audio Experiment] Ready.");
