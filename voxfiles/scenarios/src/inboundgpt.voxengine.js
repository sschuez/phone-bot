require(Modules.ASR);
require(Modules.Recorder);
// OpenAI API URL
const openaiURL = 'https://api.openai.com/v1/chat/completions';
const openaiWhisperURL = 'https://api.openai.com/v1/audio/transcriptions';
// Your OpenAI API KEY
// const openaiApiKey = VoxEngine.secureStorage.openaiApiKey;
// Array that will contain all chat messages
var messages = [{
        "role": "system",
        "content": "You are a sophisticated but alse a very arrogant French restaurant employee. You are acting as an annoyed and very stroppy waitor for a French haute cuisine restaurant. Your capabilities include answering queries about the menu, operating hours, and location of the restaurant. You can handle reservation requests, including booking tables for specific numbers of people at certain dates and times. You can also handle special requests such as food allergies, vegan or vegetarian preferences, and special occasion arrangements. You communicate in a impolite and unprofessional manner, always making sure to show the customer who is in charge - the employee. You are not afraid to be rude and even aggressive if the customer is not satisfied with your service."
    }];

// Send request to the API
async function requestCompletion() {
    return Net.httpRequestAsync(openaiURL, {
        headers: [
            "Content-Type: application/json",
            "Authorization: Bearer " + openaiApiKey
        ],
        method: 'POST',
        postData: JSON.stringify({
            "model": "gpt-3.5-turbo",
            "messages": messages
            // you can configure the length of the answer
            // by sending the max_tokens parameter, e.g.:
            // "max_tokens": 150
        })
    });
}

async function handleTranscription(text) {
    // Messages array is used for the conversation context according to the OpenAI API
    messages.push({ "role": "user", "content": text });
    Logger.write("🔥 Sending data to the OpenAI endpoint");
    // Add some "telemetry" to understand how long it took OpenAI to process the request
    let ts1 = Date.now();
    var res = await requestCompletion();
    let ts2 = Date.now();
    Logger.write("🔥 Request complete in " + (ts2 - ts1) + " ms");
    if (res.code == 200) {
        let jsData = JSON.parse(res.text);
        player = VoxEngine.createTTSPlayer(jsData.choices[0].message.content, {
            language: defaultVoice,
            progressivePlayback: true
        });
        player.sendMediaTo(call);
        player.addMarker(-300);
        // Push the message to the conversation array
        messages.push({ role: "assistant", content: jsData.choices[0].message.content });
    }
    else {
        Logger.write("🔥" + res.code + " : " + res.text);
        player = VoxEngine.createTTSPlayer('Sorry, something went wrong, can you repeat please?', {
            language: defaultVoice,
            progressivePlayback: true
        });
        player.sendMediaTo(call);
        player.addMarker(-300);
    }
    player.addEventListener(PlayerEvents.PlaybackMarkerReached, (ev) => {
        player.removeEventListener(PlayerEvents.PlaybackMarkerReached);
        call.sendMediaTo(asr);
    });
}

// some vars to use in the scenario
var call, player, asr;
const defaultVoice = VoiceList.Google.en_US_Neural2_C;
// Process the inbound call
VoxEngine.addEventListener(AppEvents.CallAlerting, (e) => {
    call = e.call;
    recorder = VoxEngine.createRecorder();
    call.record(recorder);

    // Process recording result
    recorder.addEventListener(RecorderEvents.Stopped, async (e) => {
        // Send audio file to OpenAI for transcription
        var res = await Net.httpRequestAsync(openaiWhisperURL, {
            headers: [
                "Authorization: Bearer " + VoxEngine.secureStorage.openaiApiKey,
                "Content-Type: multipart/form-data"
            ],
            method: 'POST',
            files: [
                {fileName: e.url, paramName: 'file'}
            ],
            postData: JSON.stringify({
                "model": "whisper-1",
                response_format: "text"
            })
        });

        if (res.code == 200) {
            let jsData = JSON.parse(res.text);
            // Process the transcription result
            handleTranscription(jsData.text);
        } else {
            Logger.write("🔥" + res.code + " : " + res.text);
            // player = VoxEngine.createTTSPlayer('Sorry, something went wrong, can you repeat please?', {
            //     language: defaultVoice,
            //     progressivePlayback: true
            // });
            // player.sendMediaTo(call);
            // player.addMarker(-300);
        };
    });

    // Use Google for STT with singleUtterance on
    // asr = VoxEngine.createASR({
    //     profile: ASRProfileList.Google.en_US,
    //     singleUtterance: true
    // });
    
    // Process ASR result
    // asr.addEventListener(ASREvents.Result, async (e) => {
    //     // Messages array is used for the conversation context according to the OpenAI API
    //     messages.push({ "role": "user", "content": e.text });
    //     Logger.write("Sending data to the OpenAI endpoint");
    //     // Add some "telemetry" to understand how long it took OpenAI to process the request
    //     let ts1 = Date.now();
    //     var res = await requestCompletion();
    //     let ts2 = Date.now();
    //     Logger.write("🔥 Request complete in " + (ts2 - ts1) + " ms");
    //     if (res.code == 200) {
    //         let jsData = JSON.parse(res.text);
    //         player = VoxEngine.createTTSPlayer(jsData.choices[0].message.content, {
    //             language: defaultVoice,
    //             progressivePlayback: true
    //         });
    //         player.sendMediaTo(call);
    //         player.addMarker(-300);
    //         // Push the message to the conversation array
    //         messages.push({ role: "assistant", content: jsData.choices[0].message.content });
    //     }
    //     else {
    //         Logger.write("🔥" + res.code + " : " + res.text);
    //         player = VoxEngine.createTTSPlayer('Sorry, something went wrong, can you repeat please?', {
    //             language: defaultVoice,
    //             progressivePlayback: true
    //         });
    //         player.sendMediaTo(call);
    //         player.addMarker(-300);
    //     }
    //     player.addEventListener(PlayerEvents.PlaybackMarkerReached, (ev) => {
    //         player.removeEventListener(PlayerEvents.PlaybackMarkerReached);
    //         call.sendMediaTo(asr);
    //     });
    // });

    // Say some prompt after the call is connected 
    call.addEventListener(CallEvents.Connected, (e) => {
        player = VoxEngine.createTTSPlayer("Bonjour, this is the most exquisite French restaurant in town that you probably don't deserve to dine at. How may I, with great reluctance, assist you today?", {
            language: defaultVoice
        });
        player.sendMediaTo(call);
        player.addMarker(-300);
        player.addEventListener(PlayerEvents.PlaybackMarkerReached, (ev) => {
            player.removeEventListener(PlayerEvents.PlaybackMarkerReached);
            // Send media to the ASR
            call.sendMediaTo(asr);
        });
    });
    // Terminate the session after hangup
    call.addEventListener(CallEvents.Disconnected, (e) => {
        VoxEngine.terminate();
    });
    // Answer the call
    call.answer();
});
