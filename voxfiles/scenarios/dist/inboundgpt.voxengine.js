require(Modules.Recorder);
const openaiURL = 'https://api.openai.com/v1/chat/completions';
const openaiWhisperURL = 'https://api.openai.com/v1/audio/transcriptions';
const openaiApiKey = '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';
var messages = [{
        "role": "system",
        "content": "You are a sophisticated but also a very arrogant French restaurant employee..."
    }];
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
        })
    });
}
async function transcribeAudio(audioURL) {
    return Net.httpRequestAsync(openaiWhisperURL, {
        headers: [
            "Authorization: Bearer " + openaiApiKey,
            "Content-Type: multipart/form-data"
        ],
        method: 'POST',
        files: [
            { fileName: audioURL, paramName: 'file' }
        ],
        postData: JSON.stringify({
            "model": "whisper-1",
            "response_format": "text"
        })
    });
}
function handleTranscription(text) {
    messages.push({ "role": "user", "content": text });
    Logger.write("🔥 Sending data to the OpenAI endpoint");
    let ts1 = Date.now();
    requestCompletion()
        .then((res) => {
        let ts2 = Date.now();
        Logger.write("🔥 Request complete in " + (ts2 - ts1) + " ms");
        if (res.code == 200) {
            let jsData = JSON.parse(res.text);
            let player = VoxEngine.createTTSPlayer(jsData.choices[0].message.content, {
                language: defaultVoice,
                progressivePlayback: true
            });
            player.sendMediaTo(call);
            player.addMarker(-300);
            messages.push({ role: "assistant", content: jsData.choices[0].message.content });
        }
        else {
            Logger.write("🔥" + res.code + " : " + res.text);
            let player = VoxEngine.createTTSPlayer('Sorry, something went wrong, can you repeat please?', {
                language: defaultVoice,
                progressivePlayback: true
            });
            player.sendMediaTo(call);
            player.addMarker(-300);
        }
        player.addEventListener(PlayerEvents.PlaybackMarkerReached, (ev) => {
            player.removeEventListener(PlayerEvents.PlaybackMarkerReached);
            recorder.stop(); // Stop the previous recording
            call.record(recorder); // Start recording again
        });
    })
        .catch((err) => {
        Logger.write("🔥 Error: " + err);
        let player = VoxEngine.createTTSPlayer('Sorry, something went wrong, can you repeat please?', {
            language: defaultVoice,
            progressivePlayback: true
        });
        player.sendMediaTo(call);
        player.addMarker(-300);
        player.addEventListener(PlayerEvents.PlaybackMarkerReached, (ev) => {
            player.removeEventListener(PlayerEvents.PlaybackMarkerReached);
            recorder.stop(); // Stop the previous recording
            call.record(recorder); // Start recording again
        });
    });
}
var call, recorder;
const defaultVoice = VoiceList.Google.en_US_Neural2_C;
VoxEngine.addEventListener(AppEvents.CallAlerting, (e) => {
    call = e.call;
    recorder = VoxEngine.createRecorder();
    call.record(recorder);
    recorder.addEventListener(RecorderEvents.Stopped, async (e) => {
        try {
            const res = await transcribeAudio(e.url);
            if (res.code == 200) {
                let jsData = JSON.parse(res.text);
                handleTranscription(jsData.text);
            }
            else {
                Logger.write("🔥" + res.code + " : " + res.text);
                let player = VoxEngine.createTTSPlayer('Sorry, something went wrong, can you repeat please?', {
                    language: defaultVoice,
                    progressivePlayback: true
                });
                player.sendMediaTo(call);
                player.addMarker(-300);
                player.addEventListener(PlayerEvents.PlaybackMarkerReached, (ev) => {
                    player.removeEventListener(PlayerEvents.PlaybackMarkerReached);
                    recorder.stop(); // Stop the previous recording
                    call.record(recorder); // Start recording again
                });
            }
        }
        catch (err) {
            Logger.write("🔥 Error: " + err);
            let player = VoxEngine.createTTSPlayer('Sorry, something went wrong, can you repeat please?', {
                language: defaultVoice,
                progressivePlayback: true
            });
            player.sendMediaTo(call);
            player.addMarker(-300);
            player.addEventListener(PlayerEvents.PlaybackMarkerReached, (ev) => {
                player.removeEventListener(PlayerEvents.PlaybackMarkerReached);
                recorder.stop(); // Stop the previous recording
                call.record(recorder); // Start recording again
            });
        }
    });
    call.addEventListener(CallEvents.Connected, (e) => {
        let player = VoxEngine.createTTSPlayer("Bonjour, this is the most exquisite French restaurant in town that you probably don't deserve to dine at. How may I, with great reluctance, assist you today?", {
            language: defaultVoice
        });
        player.sendMediaTo(call);
        player.addMarker(-300);
        player.addEventListener(PlayerEvents.PlaybackMarkerReached, (ev) => {
            player.removeEventListener(PlayerEvents.PlaybackMarkerReached);
            recorder.stop(); // Stop the previous recording
            call.record(recorder); // Start recording again
        });
    });
    call.addEventListener(CallEvents.Disconnected, (e) => {
        VoxEngine.terminate();
    });
    call.answer();
});
