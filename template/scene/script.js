function Timer () {
    this.time = 0.0;
}

Timer.prototype.updateTime = function(rate, val, dt) {
    this.time = this.time+rate*dt*val;
}

function SmoothCounter () {
    this.oldCount = 0.0;
    this.isGoing = 0.0;
    this.currentValue = 0.0;
}

SmoothCounter.prototype.update = function(dt, newCount, speed) {
    this.currentValue = this.currentValue+(newCount-this.currentValue)*speed;
}

var highTimevar = new Timer();
var timevar = new Timer();

function update(dt) {

    try {
        timevar.updateTime(0.5,  (inputs.syn_Level*2.0+inputs.syn_Presence+inputs.syn_Hits*2.0)*inputs.rate_in, dt);
        highTimevar.updateTime(1.0, (inputs.syn_HighHits + inputs.syn_HighHits*inputs.syn_HighHits)*inputs.rate_in, dt);

        uniforms.time_highs = highTimevar.time;
        uniforms.script_time = timevar.time;
    } catch (e){
        print(e);
    }

}
