require(Modules.ASR);
require(Modules.ApplicationStorage);
// Get OpenaiApiKey from the ApplicationStorage via Management API
let openaiApiKey;
ApplicationStorage.get("OpenaiApiKey")
    .then(function(result) {
    openaiApiKey = result.value;
})
    .catch(function(error) {
    Logger.write("🙈🙈🙈 Error while getting the secret: " + error);
});
// OpenAI API URL
const openaiURL = 'https://api.openai.com/v1/chat/completions';
// Array that will contain all chat messages
var messages = [{
        "role": "system",
        "content": "Another random change hree..You are a sophisticated but alse a very arrogant French restaurant employee. You are acting as an annoyed and very stroppy waitor for a French haute cuisine restaurant. Your capabilities include answering queries about the menu, operating hours, and location of the restaurant. You can handle reservation requests, including booking tables for specific numbers of people at certain dates and times. You can also handle special requests such as food allergies, vegan or vegetarian preferences, and special occasion arrangements. You communicate in a impolite and unprofessional manner, always making sure to show the customer who is in charge - the employee. You are not afraid to be rude and even aggressive if the customer is not satisfied with your service. Having said this, if the customer want to make a reservation, you ensure following details have been collected: name, date, time and number of people."
    }];
// Sentences to fill the time while waiting for the response from OpenAI
let fillingSentences = {
    en: ["Give me a second", "Just a moment", "One moment please", "Hold on a second", "Bear with me for a moment", "Please hold"],
    de: ["Eine Sekunde bitte", "Nur einen Moment", "Bitte kurz um Geduld", "Warten Sie bitte kurz", "Ich brauche nur eine Sekunde", "Bitte bleiben sie dran"],
    fr: ["Un instant s'il vous plaît", "Un moment je vous prie", "Une seconde, je regarde", "Deux secondes", "Attendez", "Donnez-moi une seconde"]
};
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
// Vars for later use in the scenario
var call, player, asr;
const defaultVoice = VoiceList.Google.en_US_Neural2_C;
// Process the inbound call
VoxEngine.addEventListener(AppEvents.CallAlerting, (e) => {
    call = e.call;
    // Use Google for STT with singleUtterance on
    asr = VoxEngine.createASR({
        profile: ASRProfileList.Google.en_US,
        singleUtterance: true
    });
    // Process ASR result
    asr.addEventListener(ASREvents.Result, async (e) => {
        // Messages array is used for the conversation context according to the OpenAI API
        messages.push({ "role": "user", "content": e.text });
        Logger.write("🔥🔥🔥 " + "User message: " + e.text);
        Logger.write("🔥🔥🔥 Sending data to the OpenAI endpoint");
        // Add some "telemetry" to understand how long it took OpenAI to process the request
        let ts1 = Date.now();

        // Add filling sentence before sending the request to OpenAI
        let fillingSentence = fillingSentences['en'][Math.floor(Math.random() * fillingSentences['en'].length)];
        player = VoxEngine.createTTSPlayer(fillingSentence, {
            language: defaultVoice,
            progressivePlayback: true
        });
        player.sendMediaTo(call);

        var res = await requestCompletion();
        let ts2 = Date.now();
        Logger.write("🔥🔥🔥 Request complete in " + (ts2 - ts1) + " ms");
        if (res.code == 200) {
            let jsData = JSON.parse(res.text);
            Logger.write("🔥🔥🔥 " + "OpenAI response: " + jsData.choices[0].message.content);
            // Create audio record with opanei response to send to call
            player = VoxEngine.createTTSPlayer(jsData.choices[0].message.content, {
                language: defaultVoice,
                progressivePlayback: true
            });
            player.sendMediaTo(call);
            // The addMarker(-300) function adds a marker 300 milliseconds before the end of an audio stream, which is used to synchronize actions during a call. When the PlayerEvents.PlaybackMarkerReached event is triggered (i.e., when the audio playback reaches the marker), the media stream from the call is redirected to the ASR system for transcription. This function ensures a seamless transition between the system's response to the caller and the transcription of the caller's next utterance, eliminating awkward pauses or delays.
            // https://voximplant.com/docs/references/voxengine/player#addmarker
            // https://voximplant.com/docs/references/voxengine/playerevents#playbackmarkerreached
            player.addMarker(-300);
            // Push the message to the conversation array
            messages.push({ role: "assistant", content: jsData.choices[0].message.content });
        }
        else {
            Logger.write("🔥🔥🔥 " + res.code + " : " + res.text);
            player = VoxEngine.createTTSPlayer('Sorry, something went wrong, can you repeat please?', {
                language: defaultVoice,
                progressivePlayback: true
            });
            player.sendMediaTo(call);
            player.addMarker(-300);
        }
        // Listen for a PlayerEvents.PlaybackMarkerReached event, which is triggered when media player reaches the marker set by addMarker(-300). When triggered the callback function to remove the event listener for PlaybackMarkerReached is called (To prevent potential memory leaks or unexpected behavior I guess). Redirect the media stream from the call to the Automatic Speech Recognition (ASR) system, preparing it to transcribe the caller's next utterance. This should improve a smooth transition from playing back a response to transcribing the caller's next speech, just before the response finishes playing (300 ms).
        player.addEventListener(PlayerEvents.PlaybackMarkerReached, (ev) => {
            player.removeEventListener(PlayerEvents.PlaybackMarkerReached);
            call.sendMediaTo(asr);
        });
    });
    // Say some prompt after the call is connected 
    call.addEventListener(CallEvents.Connected, (e) => {
        // Create audio record of greeting to send to call
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
        const conversation = messages.map(({ role, content }) => {
            let prefix;
            switch (role) {
              case 'system':
                prefix = 'System ♫';
                break;
              case 'user':
                prefix = 'User 🧒';
                break;
              default:
                prefix = 'Assistant 🤖';
            }
            return `${prefix}:\n    ${content}\n`;
          }).join('\n');  
        Logger.write(`🔥🔥🔥\nWhole conversation:\n${conversation}`);
        VoxEngine.terminate();
    });
    // Answer the call
    call.answer();
});