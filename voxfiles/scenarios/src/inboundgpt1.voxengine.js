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
const openaiURL = 'https://api.openai.com/v1/chat/completions';
const defaultVoice = VoiceList.Google.en_US_Neural2_C;
const states = ['INIT', 'LISTENING', 'GENERATING_RESPONSE', 'TERMINATION'];
let currentState = states[0];
let call, player, asr;
let messages = [{
    "role": "system",
    "content": "You are a sophisticated but alse a very arrogant French restaurant employee. You are acting as an annoyed and very stroppy waitor for a French haute cuisine restaurant. Your capabilities include answering queries about the menu, operating hours, and location of the restaurant. You can handle reservation requests, including booking tables for specific numbers of people at certain dates and times. You can also handle special requests such as food allergies, vegan or vegetarian preferences, and special occasion arrangements. You communicate in a impolite and unprofessional manner, always making sure to show the customer who is in charge - the employee. You are not afraid to be rude and even aggressive if the customer is not satisfied with your service. Having said this, if the customer want to make a reservation, you ensure following details have been collected: name, date, time, number of people and, if any, special requests."
}];
let fillingSentences = {
    en: ["Give me a second", "Just a moment", "One moment please", "Hold on a second", "Bear with me for a moment", "Please hold"],
    de: ["Eine Sekunde bitte", "Nur einen Moment", "Bitte kurz um Geduld", "Warten Sie bitte kurz", "Ich brauche nur eine Sekunde", "Bitte bleiben sie dran"],
    fr: ["Un instant s'il vous plaît", "Un moment je vous prie", "Une seconde, je regarde", "Deux secondes", "Attendez", "Donnez-moi une seconde"]
};

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

function playTTS(content, callback) {
    player = VoxEngine.createTTSPlayer(content, {
        language: defaultVoice,
        progressivePlayback: true
    });
    player.sendMediaTo(call);
    player.addMarker(-300);
    player.addEventListener(PlayerEvents.PlaybackMarkerReached, callback);
}

function processASRResult(e) {
    if (currentState === 'LISTENING') {
        handleListeningState(e);
    }
}

async function handleListeningState(e) {
    currentState = states[2];
    messages.push({ "role": "user", "content": e.text });
    Logger.write("🔥🔥🔥 " + "User message: " + e.text);
    Logger.write("🔥🔥🔥 Sending data to the OpenAI endpoint");
    let ts1 = Date.now();
    let fillingSentence = fillingSentences['en'][Math.floor(Math.random() * fillingSentences['en'].length)];
    playTTS(fillingSentence, (ev) => {
        player.removeEventListener(PlayerEvents.PlaybackMarkerReached);
        call.sendMediaTo(asr);
        currentState = states[1];
    });
    var res = await requestCompletion();
    handleOpenaiResponse(res, ts1);
}

function handleOpenaiResponse(res, ts1) {
    let ts2 = Date.now();
    Logger.write("🔥🔥🔥 Request complete in " + (ts2 - ts1) + " ms");
    if (res.code == 200) {
        let jsData = JSON.parse(res.text);
        Logger.write("🔥🔥🔥 " + "OpenAI response: " + jsData.choices[0].message.content);
        playTTS(jsData.choices[0].message.content, (ev) => {
            player.removeEventListener(PlayerEvents.PlaybackMarkerReached);
            call.sendMediaTo(asr);
            currentState = states[1];
        });
        messages.push({ role: "assistant", content: jsData.choices[0].message.content });
    }
    else {
        Logger.write("🔥🔥🔥 " + res.code + " : " + res.text);
        playTTS('Sorry, something went wrong, can you repeat please?', (ev) => {
            player.removeEventListener(PlayerEvents.PlaybackMarkerReached);
            call.sendMediaTo(asr);
            currentState = states[1];
        });
    }
}

// Fetch OpenAI API key from ApplicationStorage and then start the scenario
VoxEngine.addEventListener(AppEvents.CallAlerting, (e) => {
    call = e.call;
    asr = VoxEngine.createASR({
        profile: ASRProfileList.Google.en_US,
        singleUtterance: true
    });
    asr.addEventListener(ASREvents.Result, processASRResult);
    call.answer();
    call.addEventListener(CallEvents.Connected, (e) => {
        currentState = states[1];
        playTTS("Bonjour, this is the most exquisite French restaurant in town that you probably don't deserve to dine at. How may I, with great reluctance, assist you today?", (ev) => {
            player.removeEventListener(PlayerEvents.PlaybackMarkerReached);
            call.sendMediaTo(asr);
        });
    });
    call.addEventListener(CallEvents.Disconnected, (e) => {
        currentState = states[3];
        const conversation = messages.map(({ role, content }) => `${role === 'system' ? 'System ♫' : role === 'user' ? 'User 🧒' : 'Assistant 🤖'}:\n    ${content}\n`).join('\n');
        Logger.write(`🔥🔥🔥\nWhole conversation:\n${conversation}`);
        VoxEngine.terminate();
    });
});