var pc = new RTCPeerConnection();

// get DOM elements
var dataChannelLog = document.getElementById('data-channel');

// register some listeners to help debugging
pc.addEventListener('icegatheringstatechange', function() {
    console.log('ICE_GATHERING_STATE_CHANGE', pc.iceGatheringState);
}, false);

pc.addEventListener('iceconnectionstatechange', function() {
    console.log('ICE_CONNECTION_STATE_CHANGE', pc.iceConnectionState);
}, false);

pc.addEventListener('signalingstatechange', function() {
    console.log('ICE_SIGNAL_STATE_CHANGE', pc.signalingState);
}, false);

// connect audio / video
pc.addEventListener('track', function(evt) {
    if (evt.track.kind == 'video')
        console.log("Video");
    else
        console.log("Audio")
});

document.onkeydown = function()  {
    if (event.srcElement.tagName.toUpperCase() != 'INPUT') {
        return (event.keyCode != 8);
    }
};

// data channel
var dc = null, dcInterval = null;

function negotiate() {
    return pc.createOffer().then(function(offer) {
        return pc.setLocalDescription(offer);
    }).then(function() {
        // wait for ICE gathering to complete
        return new Promise(function(resolve) {
            if (pc.iceGatheringState === 'complete') {
                resolve();
            } else {
                function checkState() {
                    if (pc.iceGatheringState === 'complete') {
                        pc.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                }
                pc.addEventListener('icegatheringstatechange', checkState);
            }
        });
    }).then(function() {
        var offer = pc.localDescription;

        console.log('offer-sdp', offer.sdp);
        return fetch('/offer', {
            body: JSON.stringify({
                sdp: offer.sdp,
                type: offer.type,
            }),
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST'
        });
    }).then(function(response) {
        return response.json();
    }).then(function(answer) {
        console.log('answer-sdp', answer.sdp);
        return pc.setRemoteDescription(answer);
    }).catch(function(e) {
        alert(e);
    });
}

function start() {
    document.getElementById('start').style.display = 'none';

    dc = pc.createDataChannel('chat');
    dc.onclose = function() {
        clearInterval(dcInterval);
        dataChannelLog.textContent += '- close\n';
    };
    dc.onopen = function() {
        dataChannelLog.textContent += '- open\n';
        document.getElementById("message").addEventListener("keyup", function(event) {
            if(event.key == "Enter") {
                var message = document.getElementById("message").value;
                dataChannelLog.textContent += '> ' + message + '\n';
                dc.send(message);
            }
        });

        document.getElementById("screen").addEventListener("click", function(event) {
            var message = "mouse.click(" + event.offsetX + ", " + event.offsetY + ")";
            dc.send(message);
        });

        document.getElementById("screen").addEventListener("dblclick", function(event) {
            var message = "mouse.click(" + event.offsetX + ", " + event.offsetY + ", {'clickCount': 2})";
            dc.send(message);
        });

        document.getElementById("screen").addEventListener("contextmenu", function(event) {
            var message = "mouse.click(" + event.offsetX + ", " + event.offsetY + ", {'button':"+"'right'"+"})";
            dc.send(message);
        });

        document.getElementById("up").addEventListener("click", function(event) {
            dc.send('evaluate("() => { window.scrollBy(0, - window.innerHeight / 2); }")');

        });

        document.getElementById("down").addEventListener("click", function(event) {
            dc.send('evaluate("() => { window.scrollBy(0, window.innerHeight / 2); }")');
        });

        document.getElementById("goback").addEventListener("click", function(event) {
            dc.send('goBack()');
        });

        document.getElementById("goforward").addEventListener("click", function(event) {
            dc.send('goForward()');
        });

        document.getElementById("reload").addEventListener("click", function(event) {
            dc.send('reload()');
        });

        document.getElementById("goto").addEventListener("keyup", function(event) {
            if(event.key == "Enter") {
                var goto = document.getElementById("goto").value;
                dc.send('goto("' + goto + '")');
            }
        });

        document.onkeyup = function(event) {
            if(document.activeElement.tagName != "INPUT") {
                dc.send('keyboard.press("' + event.code + '")');
            }
        }



        /*dcInterval = setInterval(function() {
            //var message = "test";
            var message = document.getElementById("message").value;
            dataChannelLog.textContent += '> ' + message + '\n';
            dc.send(message);
        }, 1000);*/
    };
    dc.onmessage = function(evt) {
        //console.log(evt.data);
        document.getElementById('screen').setAttribute('src', 'data:image/png;base64,' + evt.data);
        //dataChannelLog.textContent += '< ' + evt.data + '\n';
    };

    negotiate();

    document.getElementById('stop').style.display = 'inline-block';
}

function stop() {
    document.getElementById('stop').style.display = 'none';

    // close data channel
    if (dc) {
        dc.close();
    }

    // close transceivers
    /*if (pc.getTransceivers) {
        pc.getTransceivers().forEach(function(transceiver) {
            transceiver.stop();
        });
    }*/

    // close peer connection
    setTimeout(function() {
        pc.close();
    }, 500);
}
