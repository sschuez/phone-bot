// Import Voxengine modules
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

class FiniteStateMachine {
  constructor() {
      this.states = ['Init', 'Listening', 'GeneratingResponse', 'Termination'];
      this.currentState = 'Init';
  }
  isValidState(state) {
      return this.states.includes(state);
  }
  getCurrentState() {
      return this.currentState;
  }
  goToListening() {
      if (this.currentState === 'Init' || this.currentState === 'GeneratingResponse') {
          Logger.write("FSM: " + this.currentState + " --> Listening")
          this.currentState = 'Listening'
          return true;
      } else {
          // cannot go to Listening from an other state
          Logger.write("FSM: Stay in " + this.currentState)
          return false;
      }
  }
  goToGeneratingState() {
      if (this.currentState === 'Listening') {
          Logger.write("FSM: " + this.currentState + " --> GeneratingResponse")
          this.currentState = 'GeneratingResponse'
          return true;
      } else {
          // cannot go to GeneratingResponse from an other state (mostly when you are already generating!)
          Logger.write("FSM: Stay in " + this.currentState)
          return false;
      }
  }
  goToTerminationState() {
      Logger.write("FSM: " + this.currentState + " --> Termination")
      this.currentState = 'Termination'
      return true;
  }
}

class CallEvent {
  constructor(call, asr, openaiApiKey) {
      this.call = call;
      this.asr = asr;
      this.openaiURL = 'https://api.openai.com/v1/chat/completions';
      this.openaiApiKey = openaiApiKey;
      this.fsm = new FiniteStateMachine();
      this.messages = [{
          "role": "system",
          "content": "You are a sophisticated but alse a very arrogant French restaurant employee. You are acting as an annoyed and very stroppy waitor for a French haute cuisine restaurant. Your capabilities include answering queries about the menu, operating hours, and location of the restaurant. You can handle reservation requests, including booking tables for specific numbers of people at certain dates and times. You can also handle special requests such as food allergies, vegan or vegetarian preferences, and special occasion arrangements. You communicate in a impolite and unprofessional manner, always making sure to show the customer who is in charge - the employee. You are not afraid to be rude and even aggressive if the customer is not satisfied with your service. Having said this, if the customer want to make a reservation, you ensure following details have been collected: name, date, time, number of people and, if any, special requests."
      }];
      this.fillingSentences = {
          en: ["Give me a second", "Just a moment", "One moment please", "Hold on a second", "Bear with me for a moment", "Please hold"],
          de: ["Eine Sekunde bitte", "Nur einen Moment", "Bitte kurz um Geduld", "Warten Sie bitte kurz", "Ich brauche nur eine Sekunde", "Bitte bleiben sie dran"],
          fr: ["Un instant s'il vous plaît", "Un moment je vous prie", "Une seconde, je regarde", "Deux secondes", "Attendez", "Donnez-moi une seconde"]
      };
      this.greeting = "Bonjour, this is the most exquisite French restaurant in town that you probably don't deserve to dine at. How may I, with great reluctance, assist you today?"
  }

  async processASRResult(e) {
      if (this.fsm.getCurrentState() === 'Listening') {
          await this.handleListeningState(e);
      }
  }

  async handleListeningState(e) {
      if (this.fsm.goToGeneratingState()) {
          this.messages.push({ "role": "user", "content": e.text });
          let fillingSentence = this.fillingSentences['en'][Math.floor(Math.random() * this.fillingSentences['en'].length)];
          this.playTTS(fillingSentence, (ev) => {
              this.asr.sendMediaTo(this.call);
              this.fsm.goToListening();
          });
          var res = await this.requestCompletion();
          this.handleOpenaiResponse(res);
      }
  }
  async requestCompletion() {
      return Net.httpRequestAsync(this.openaiURL, {
          headers: [
              "Content-Type: application/json",
              "Authorization: Bearer " + this.openaiApiKey
          ],
          method: 'POST',
          postData: JSON.stringify({
              "model": "gpt-3.5-turbo",
              "messages": this.messages
          })
      });
  }

  handleOpenaiResponse(res) {
      if (res.code == 200) {
          let jsData = JSON.parse(res.text);
          this.playTTS(jsData.choices[0].message.content, (ev) => {
              this.asr.sendMediaTo(this.call);
              this.fsm.goToListening();
          });
          this.messages.push({ role: "assistant", content: jsData.choices[0].message.content });
      }
      else {
          this.playTTS('Sorry, something went wrong, can you repeat please?', (ev) => {
              this.asr.sendMediaTo(this.call);
              this.fsm.goToListening();
          });
      }
  }

  playTTS(content, callback) {
      let player = VoxEngine.createTTSPlayer(content, {
          language: VoiceList.Google.en_US_Neural2_C,
          progressivePlayback: true
      });
      player.sendMediaTo(this.call);
      player.addMarker(-300);
      player.addEventListener(PlayerEvents.PlaybackMarkerReached, callback);
  }
}

// Handle incoming call
VoxEngine.addEventListener(AppEvents.CallAlerting, (e) => {
  let call = e.call;
  let asr = VoxEngine.createASR({
      profile: ASRProfileList.Google.en_US,
      singleUtterance: true
  });

  // let openaiApiKey;
  // ApplicationStorage.get("OpenaiApiKey")
      // .then(function(result) {
          // openaiApiKey = result.value;
          let callEvent = new CallEvent(call, asr, openaiApiKey);
          asr.addEventListener(ASREvents.Result, callEvent.processASRResult.bind(callEvent));
          call.answer();
          call.addEventListener(CallEvents.Connected, (ev) => {
              callEvent.playTTS(callEvent.greeting, (ev) => {
                  asr.sendMediaTo(call);
                  callEvent.fsm.goToListening();
              });
          });
      // })
      // .catch(function(error) {
          // Logger.write("Error while getting the secret: " + error);
      // });
});