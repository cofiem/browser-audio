/*
 * Refs:
 * https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_Web_Audio_API
 * https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement
 * https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource
 * https://developer.mozilla.org/en-US/docs/Web/API/MediaSource/MediaSource
 */

// shared data
const audioFiles = [];
const audioContext = (window.AudioContext ? new window.AudioContext() : new window.webkitAudioContext());

// box to allow drag and drop files
const selectFilesBox = document.getElementById("selectFilesBox");
selectFilesBox.addEventListener("dragenter", selectFilesBoxDragenter, false);
selectFilesBox.addEventListener("dragover", selectFilesBoxDragenterDragover, false);
selectFilesBox.addEventListener("drop", selectFilesBoxDragenterDragoverDrop, false);

function selectFilesBoxDragenter(e) {
    e.stopPropagation();
    e.preventDefault();
}

function selectFilesBoxDragenterDragover(e) {
    e.stopPropagation();
    e.preventDefault();
}

function selectFilesBoxDragenterDragoverDrop(e) {
    e.stopPropagation();
    e.preventDefault();
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

// input to allow selecting files
const selectFilesInput = document.getElementById("selectFilesInput");
selectFilesInput.addEventListener("change", handleFiles, false);

const selectFilesClearButton = document.getElementById("selectFilesClearButton");
selectFilesClearButton.addEventListener("click", clearFiles, false);

function handleFiles(data) {
    let files = [];
    if (data instanceof FileList) {
        files = data;
    } else if (data instanceof Event) {
        files = data.target.files;
    }

    for (let i = 0; i < files.length; i++) {
        let file = files[i];
        if (!file.type.startsWith("audio/")) {
            console.log(`Selected file '${file.name}' (${file.type}) is not an audio file.`);
            continue;
        }
        if (audioFiles.find(element => element.name === file.name)) {
            console.log(`Selected file '${file.name}' (${file.type}) has already been added.`);
            continue;
        }
        audioFiles.push(file);
    }

    updateFileDisplay();

    if (audioFiles && audioFiles.length > 0) {
        let audioFile = audioFiles[0];

        if (!audioFile || !(audioFile instanceof File)) {
            console.warn(`Audio file cannot be used '${audioFile}'.`);
            return;
        }

        let audioFileUrl = window.URL.createObjectURL(audioFile);
        audioFile.objectUrl = audioFileUrl;

        audioElement.src = audioFileUrl;
    }
}

function updateFileDisplay() {
    let byteCount = 0;
    for (let i = 0; i < audioFiles.length; i++) {
        let audioFile = audioFiles[i];
        byteCount += audioFile.size;
    }

    let fileSizeText = byteCount + " bytes";
    for (let aMultiples = ["KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"],
             nMultiple = 0,
             nApprox = byteCount / 1024; nApprox > 1; nApprox /= 1024, nMultiple++) {
        fileSizeText = nApprox.toFixed(3) + " " + aMultiples[nMultiple] + " (" + byteCount + " bytes)";
    }
    document.getElementById("selectFilesTotalCount").innerHTML = audioFiles.length.toString();
    document.getElementById("selectFilesTotalSize").innerHTML = fileSizeText;
}

function clearFiles() {
    audioFiles.length = 0;

    let selectFilesInput = document.getElementById("selectFilesInput");
    selectFilesInput.value = '';

    updateFileDisplay();
}

// set up audio and canvas
const audioPlayPauseButton = document.getElementById("audioPlayPauseButton");
const audioPlayPauseButtonText = document.getElementById("audioPlayPauseButtonText");
audioPlayPauseButton.addEventListener("click", audioPlayOrPause, false);

const audioResetButton = document.getElementById("audioResetButton");

const audioElement = document.getElementById("audioElement");
audioElement.addEventListener('ended', audioEnded, false);


function audioPlayOrPause() {

    // check if context is in suspended state (autoplay policy)
    if (audioContext.state === 'suspended') {
        audioContext.resume();
        draw();
        draw2();
        draw3();
    }

    // play or pause track depending on state
    if (this.dataset.playing === 'false') {
        audioElement.play();
        this.dataset.playing = 'true';
        audioPlayPauseButtonText.innerHTML = 'Pause';
        draw();
        draw2();
        draw3();
    } else if (this.dataset.playing === 'true') {
        audioElement.pause();
        this.dataset.playing = 'false';
        audioPlayPauseButtonText.innerHTML = 'Play';
        window.cancelAnimationFrame(drawVisual);
        window.cancelAnimationFrame(drawVisual2);
        window.cancelAnimationFrame(drawVisual3);
    }
}

function audioEnded() {
    audioPlayPauseButton.dataset.playing = 'false';
    audioPlayPauseButtonText.innerHTML = 'Play';
    window.cancelAnimationFrame(drawVisual);
    window.cancelAnimationFrame(drawVisual2);
    window.cancelAnimationFrame(drawVisual3);
}

// visualisation
const audioCanvas = document.getElementById("audioCanvas");
const audioCanvasContext = audioCanvas.getContext('2d');


let mediaElementAudioSourceNode = audioContext.createMediaElementSource(audioElement);
mediaElementAudioSourceNode.connect(audioContext.destination);

let analyserNode = audioContext.createAnalyser();
mediaElementAudioSourceNode.connect(analyserNode);
analyserNode.fftSize = 2048;
let analyserNodeBufferLength = analyserNode.frequencyBinCount;
let analyserNodeDataArray = new Uint8Array(analyserNodeBufferLength);

audioCanvasContext.clearRect(0, 0, audioCanvas.width, audioCanvas.height);

// waveform
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API
// https://github.com/mdn/voice-change-o-matic/blob/gh-pages/scripts/app.js#L123-L167
let drawVisual;
let draw = function drawStep() {
    // To create the oscilloscope visualisation

    // use requestAnimationFrame() to keep looping the drawing function once it has been started
    drawVisual = requestAnimationFrame(draw);

    // grab the time domain data and copy it into our array
    analyserNode.getByteTimeDomainData(analyserNodeDataArray);

    // fill the canvas with a solid colour to start
    audioCanvasContext.fillStyle = 'rgb(200, 200, 200)';
    audioCanvasContext.fillRect(0, 0, audioCanvas.width, audioCanvas.height);

    // Set a line width and stroke colour for the wave we will draw, then begin drawing a path
    audioCanvasContext.lineWidth = 2;
    audioCanvasContext.strokeStyle = 'rgb(0, 0, 0)';
    audioCanvasContext.beginPath();

    // Determine the width of each segment of the line to be drawn by dividing the canvas width by the array length
    // (equal to the FrequencyBinCount, as defined earlier on), then define an x variable to define the position to
    // move to for drawing each segment of the line.
    let sliceWidth = audioCanvas.width * 1.0 / analyserNodeBufferLength;
    let x = 0;

    // run through a loop, defining the position of a small segment of the wave for each point in the buffer at a
    // certain height based on the data point value form the array, then moving the line across to the place where
    // the next wave segment should be drawn.
    for (let i = 0; i < analyserNodeBufferLength; i++) {

        let v = analyserNodeDataArray[i] / 128.0;
        let y = v * audioCanvas.height / 2;

        if (i === 0) {
            audioCanvasContext.moveTo(x, y);
        } else {
            audioCanvasContext.lineTo(x, y);
        }

        x += sliceWidth;
    }

    // finish the line in the middle of the right hand side of the canvas, then draw the stroke we've defined.
    audioCanvasContext.lineTo(audioCanvas.width, audioCanvas.height / 2);
    audioCanvasContext.stroke();

};

// frequency
const audioCanvasFrequency = document.getElementById("audioCanvasFrequency");
const audioCanvasFrequencyContext = audioCanvasFrequency.getContext('2d');

audioCanvasFrequencyContext.clearRect(0, 0, audioCanvasFrequency.width, audioCanvasFrequency.height);
let audioCanvasFrequencyDataArray = new Uint8Array(analyserNodeBufferLength);

let drawVisual2;
let draw2 = function drawStep2() {
    // Another nice little sound visualization to create is one of those Winamp-style frequency bar graphs.

    // setting up a loop with requestAnimationFrame() so that the displayed data keeps updating,
    // and clearing the display with each animation frame.
    drawVisual2 = requestAnimationFrame(draw2);

    analyserNode.getByteFrequencyData(audioCanvasFrequencyDataArray);

    audioCanvasFrequencyContext.fillStyle = 'rgb(0, 0, 0)';
    audioCanvasFrequencyContext.fillRect(0, 0, audioCanvasFrequency.width, audioCanvasFrequency.height);

    // Now we set our barWidth to be equal to the canvas width divided by the number of bars (the buffer length).
    // However, we are also multiplying that width by 2.5, because most of the frequencies will come back as having
    // no audio in them, as most of the sounds we hear every day are in a certain lower frequency range. We don't
    // want to display loads of empty bars, therefore we simply shift the ones that will display regularly at a
    // noticeable height across so they fill the canvas display.
    //
    // We also set a barHeight variable, and an x variable to record how far across the screen to draw the current bar.
    let barWidth = (audioCanvasFrequency.width / analyserNodeBufferLength) * 2.5;
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
    for (let i = 0; i < analyserNodeBufferLength; i++) {
        barHeight = audioCanvasFrequencyDataArray[i] / 2;

        audioCanvasFrequencyContext.fillStyle = 'rgb(' + (barHeight + 100) + ',50,50)';
        audioCanvasFrequencyContext.fillRect(x, audioCanvasFrequency.height - barHeight / 2, barWidth, barHeight);

        x += barWidth + 1;
    }
};


// spectrogram from https://gist.github.com/moust/95f5cd5daa095f1aad89
const audioCanvasSpectrogram = document.getElementById("audioCanvasSpectrogram");
const audioCanvasSpectrogramContext = audioCanvasSpectrogram.getContext('2d');

audioCanvasSpectrogramContext.clearRect(0, 0, audioCanvasSpectrogram.width, audioCanvasSpectrogram.height);
let audioCanvasSpectrogramDataArray = new Uint8Array(analyserNodeBufferLength);

let getColor = chroma.scale(['#000', '#666', '#aaa', '#fff'], [0, .25, .75, 1]).domain([0, 300]);

let tempCanvas = document.createElement("canvas"),
    tempCtx = tempCanvas.getContext("2d");
tempCanvas.width = audioCanvasSpectrogram.width;
tempCanvas.height = audioCanvasSpectrogram.height;

let drawVisual3;
let draw3 = function drawStep3() {
    drawVisual3 = requestAnimationFrame(draw3);
    analyserNode.getByteFrequencyData(audioCanvasSpectrogramDataArray);

    // copy the current canvas onto the temp canvas
    tempCtx.drawImage(audioCanvasSpectrogram, 0, 0, audioCanvasSpectrogram.width, audioCanvasSpectrogram.height);
    for (let i = 0; i < audioCanvasSpectrogramDataArray.length; i++) {
        let magnitude = Math.log(Math.abs(audioCanvasSpectrogramDataArray[i])+1);
        // audioCanvasSpectrogramContext.fillStyle = 'rgb(' + Math.round(magnitude*40) + ', ' + Math.round(magnitude*5) + ', 0)';
        audioCanvasSpectrogramContext.fillStyle = getColor(audioCanvasSpectrogramDataArray[i]).hex();
        audioCanvasSpectrogramContext.fillRect(audioCanvasSpectrogram.width - 1, audioCanvasSpectrogram.height - i, 1, 1);
    }

    // let landmarks = getLandmarks(audioCanvasSpectrogramDataArray);
    // for (let i = 0; i < landmarks.length; i++) {
    //     audioCanvasSpectrogramContext.fillStyle = 'rgb(100, 200, 255)';
    //     audioCanvasSpectrogramContext.fillRect(audioCanvasSpectrogram.width - 1, audioCanvasSpectrogram.height - landmarks[i], 1, 1);
    // }

    // set translate on the canvas
    audioCanvasSpectrogramContext.translate(-1, 0);
    // draw the copied image
    audioCanvasSpectrogramContext.drawImage(tempCanvas, 0, 0, audioCanvasSpectrogram.width, audioCanvasSpectrogram.height, 0, 0, audioCanvasSpectrogram.width, audioCanvasSpectrogram.height);
    // reset the transformation matrix
    audioCanvasSpectrogramContext.setTransform(1, 0, 0, 1, 0, 0);
};

function getLandmarks (array) {
    var recordPoints = [0,0,0,0,0];
    var highscores = [0,0,0,0,0];
    for(var i = 0; i < array.length; i++) {
        var magnitude = Math.log(Math.abs(array[i]) + 1);
        var index = getIndex(array[i]);
        if (magnitude > highscores[index]) {
            highscores[index] = magnitude;
            recordPoints[index] = array[i];
        }
    }
    return recordPoints;
}
var RANGE = [40,80,120,180,300];
function getIndex (value) {
    var i = 0;
    while(RANGE[i] < value) i++;
    return i;
}

let gui = new dat.GUI();
let f1 = gui.addFolder('Analyser');
f1.open();
f1.add(analyserNode, 'minDecibels', -100, 0);
f1.add(analyserNode, 'maxDecibels', -100, 0);
f1.add(analyserNode, 'smoothingTimeConstant', 0, 1).step(0.01);
f1.add(analyserNode, 'fftSize', [32, 64, 128, 256, 512, 1024, 2048]);
