'use strict';

function loadTextFromUrl(url, complete) {

	var xhr = new XMLHttpRequest();
	xhr.open("GET",url,true);
	xhr.responseType = "text";
	xhr.addEventListener('load',function(){
		if(xhr.status == 200 || xhr.status == 304 || xhr.status == 0) {
			if(complete) complete(xhr.response, url, null);
		} else if(xhr.status == 404) {
			var err = new Error("File Not Found: " + url);
			if(complete) complete(null, url, err);
		} else {
			var err = new Error(xhr.statusText);
			if(complete) complete(null, url, err);
		} 
	});
	xhr.addEventListener('error',function(e){
		var err = new Error("Load Error: Check 'Access-Control-Allow-Origin' header is present for the target resource. See browser's development panel for detail. If you run this script local browser, `--allow-file-access-from-files` or the equivalent option is required.");
		if(complete) complete(null, url, err);
	});
	xhr.send();

}

// Prevent unexpected location change.
var contentChanged = false;
window.addEventListener('beforeunload',function(event) {
	if(contentChanged) {
		storeToLocalStorage();
	}
});

var editor;
function createAceEditor() {
	try {
		editor = ace.edit("editor");
			editor.setTheme("ace/theme/xcode");
			//editor.getSession().setMode("ace/mode/text");
			editor.commands.bindKey("Ctrl-P", "golineup");
			editor.$blockScrolling = Infinity;
			editor.getSession().setUseWrapMode(true);
			editor.setShowPrintMargin(false);
			editor.resize(true);
			editor.setOptions({
				indentedSoftWrap: false
			});
			editor.on('change',function() {
				contentChanged = true;
			});
		} catch(e) {
			window.alert('Failed to create the Ace editor instance. Please check your network connection.');
		}
	}

	var marker = null;
	function addErrorMarker(line) {
		var range = ace.require('ace/range');
		marker = editor.getSession().addMarker(new range.Range(line, 0, line, 2000), "mml-error", "line", true);
	}

	function removeErrorMarker() {
		if(marker) {
			editor.getSession().removeMarker(marker);
			marker = null;
		}
	}

	function highlightError(message) {
		var m = message.match(/.* in ([0-9]+)/i);
		if(m) {
			var line = parseInt(m[1]);
			addErrorMarker(line);
			editor.gotoLine(line+1, 0, true); 
		}
		document.getElementById('message').classList.remove('minimized');
	}

	var lastCompiledMGS = null;
	var lastCompiledName = null;

	function getMetaMMLInfo(mml) {
		var result = {};
		var m;
		m = mml.match(/^;\[.*duration=(auto|[0-9a-z]+).*\]/im);
		if(m) {
			if(m[1]!='auto') {
				result.duration = m[1];
			}
		}

		m = mml.match(/^;\[.*fade=([0-9a-z]+).*\]/im);
		if(m) {
			result.fade = m[1];
		}

		m = mml.match(/^;\[.*gain=([0-9]+(?:\.[0-9]+)).*\]/im);
		if(m) {
			result.gain = m[1];
		}

		m = mml.match(/^;\[.*name=([0-9A-Z_\-\.]+).*\]/im);
		if(m) {
			result.name = m[1];
		}

		return result;
	}

function compile(autoplay) {

	if(autoplay === undefined) {
		autoplay = document.getElementById('autoplay').checked;
	}

	if(contentChanged) {
		storeToLocalStorage();
		contentChanged = false;
	}

	var player = document.getElementById('player');

	MSXPlayUI.stop();
	MSXPlayUI.releaseKSS(player.dataset.hash);

	removeErrorMarker();
	var mml = editor.getValue();
	var result = MSXPlayUI.compile(mml);

	document.querySelector('#message pre').textContent = result.rawMessage;

	if(!result.success) {
		highlightError(result.rawMessage);
		lastCompiledMGS = null
		lastCompiledName = null;
		editor.focus();
		return false;
	}

	var info = getMetaMMLInfo(mml);

	lastCompiledMGS = result.mgs;
	lastCompiledName = info.name || ("" + Date.now());

	player.dataset.duration = null;
	player.dataset.gain = 1.0;			
	MSXPlayUI.setDataToPlayer(player, result.mgs, lastCompiledName);

	if(info.duration) player.dataset.duration = info.duration;
	if(info.fade) player.dataset.fade = info.fade;
	if(info.gain) player.dataset.gain = info.gain;

	if (autoplay) {
		MSXPlayUI.play(player);
	}
	editor.focus();
	return true;
}

function loadText(text) {
	editor.setValue(text,-1);
	editor.focus();
	contentChanged = false;
	removeErrorMarker();
	clearLocalStorage();
}

function loadFromUrl(url) {
	loadTextFromUrl(url, function(mml,url,err) {
		if(mml) {
			loadText(mml);
		} else {
			editor.setValue(err.toString(),-1);
			contentChanged = false;
		}
	});
}

function loadFromFile(file, complete) {
		var reader = new FileReader();
		reader.onloadend = function() {
				loadText(reader.result);
				if(complete) complete();
		}
		reader.readAsText(file);
}

function openFile(e) {
	if(0<e.target.files.length) {
		loadFromFile(e.target.files[0]);
	}
}

function clearFile(e) {
	showDialog('confirm-clear',function(value){
		if(value=="ok") {
			editor.setValue('',-1);
			clearLocalStorage();
			contentChanged = false;
		}
	});
}

var AUTOBACKUP_KEY = 'mgsc.editor.autobackup'; 

function clearLocalStorage() {
	localStorage.removeItem(AUTOBACKUP_KEY);
}

function storeToLocalStorage() {
	var text = editor.getValue();
	if(/^\s*$/.test(text)) {
		localStorage.removeItem(AUTOBACKUP_KEY);
	} else {
		localStorage.setItem(AUTOBACKUP_KEY, editor.getValue());
	}
}

function restoreFromLocalStorage() {
	editor.setValue(localStorage.getItem(AUTOBACKUP_KEY),-1);
	editor.focus();
	contentChanged = false;
}

document.addEventListener('keydown', function(e) {
	if( e.keyCode == 83 && (e.metaKey || e.ctrlKey) ) {
		e.preventDefault();
		storeToLocalStorage();
	}

	if (e.keyCode == 8) {
		if(e.target == document.body) {
			e.preventDefault();
		}
	}
});

var saveAs = function (blob, fileName) {

	var a = document.getElementById("download-helper");
	var url = a.href;
	if(url) { 
		window.URL.revokeObjectURL(url);
	}

			if(navigator.msSaveOrOpenBlob) {
				navigator.msSaveOrOpenBlob(blob,fileName);
			} else {
				a.href = window.URL.createObjectURL(blob);
				a.download = fileName;
				a.click();
			}
				
};

var abortEncode;

function mp3encode(mgs, filename, opts) {
	var start = Date.now();
		var progs = document.querySelectorAll('#encoding .encode-progress');
		var spds = document.querySelectorAll('#encoding .encode-speed');

		MSXPlayUI.mp3encode(mgs, 0, function(time, mp3data, done) {

				var elapsed = Date.now() - start;
				var speed = time / elapsed;

				for (var i = 0 ; i<progs.length ; i++) {
					progs[i].innerText = (time/1000).toFixed(1);
				}
				for (var i = 0 ; i<spds.length ; i++) {
					spds[i].innerText = (speed).toFixed(1);
				}

		if (done) {
				var blob = new Blob(mp3data, {type: 'audio/mp3'});
				saveAs(blob, filename);
				hideDialog('encoding');
				return true;
			}
				return !abortEncode;
	}, opts);
}

	function downloadMP3(rate, kbps, quality) {

		MSXPlayUI.stop();

		var mml = editor.getValue();
		var info = getMetaMMLInfo(mml);
		var result = MSXPlayUI.compile(mml);

			if (!result.success) {
				showDialog('no-mgs');
				return;
			}

			showDialog('encoding', function() {
				abortEncode = true;
			});
			abortEncode = false;

		var opts = {
			gain: info.gain || 1.0,
			playTime: info.duration || 600 * 1000,
			fadeTime: info.fade || 3000,
			sampleRate: rate,
			bitRate: kbps,
			quality: quality
		};
		var filename = (info.name || Date.now()) + '_' + rate + '_' + kbps + 'kbps.mp3';
		mp3encode(result.mgs, filename, opts);
	}

function downloadMML() {
			var blob = new Blob([editor.getValue()], {type: 'text/plain'});
	saveAs(blob, lastCompiledName || Date.now() + ".mml");
};

function downloadMGS() {
	if (compile(false)) {
			var blob = new Blob([lastCompiledMGS], {type: 'application/octet-stream'});
		saveAs(blob, lastCompiledName + ".mgs");
	} else {
		showDialog('no-mgs');
	}
};

function download() {
	if (editor.getValue().match(/^\s*$/)) {
		showDialog('no-mgs');
		return;
	}

	showDialog('download-type', function(e) {
		if (e === 'mml') {
			downloadMML();
		} else if (e === 'mgs') {
			downloadMGS();	
		} else if (e === 'mp3low') {
			downloadMP3(44100, 128, {psg:0,scc:0,opll:1,opl:1});
		} else if (e === 'mp3mid') {
			downloadMP3(44100, 160, {psg:1,scc:1,opll:1,opl:1});	
		} else if (e === 'mp3high') {
			downloadMP3(48000, 192, {psg:1,scc:1,opll:1,opl:1});
		}
	});
}

var dialogListener;

function showDialog(id, complete) {
	var dialog = document.getElementById(id);
	var stage = document.getElementById('modal-stage');
	dialogListener = function(e) {
		var target = e.target;
		while(target) {
			if(target.dataset && target.dataset.value) {
				dialog.style.display = 'none';
				stage.style.display = 'none';
				if (dialogListener != null) {
					dialog.removeEventListener('click',dialogListener);
				}
				if(complete) complete(target.dataset.value);
			}
			target = target.parentNode;
		}
	};
	dialog.addEventListener('click', dialogListener);
	stage.style.display = 'block';
	dialog.style.display = 'block';
	dialog.style.width = dialog.offsetWidth + 'px';
	dialog.style.height = dialog.offsetHeight + 'px';
	dialog.style.position = 'absolute';
}

function hideDialog(id) {
	var dialog = document.getElementById(id);
	var stage = document.getElementById('modal-stage');
	dialog.style.display = 'none';
	stage.style.display = 'none';
	if (dialogListener != null) {
		dialog.removeEventListener('click',dialogListener);
	}
}

var dragCounter = 0;

function onDragOver(e) {
		e.preventDefault();
}

function onDragEnter(e) {
	e.preventDefault();
	if(dragCounter==0) {
		document.getElementById('editor').style.borderColor = 'red';
	}
	dragCounter++;
}

function onDragLeave(e) {
	dragCounter--;
	if(dragCounter==0) {
		document.getElementById('editor').style.borderColor = null;
	}
}

function onDrop(e) {
	dragCounter = 0;
	document.getElementById('editor').style.borderColor = null;
	e.preventDefault();
		if(0<e.dataTransfer.files.length) {
		loadFromFile(e.dataTransfer.files[0], compile);
	}
	}

	function selectSample() {
		showDialog('select-sample', function(value) {
			if(value != "cancel") {
				loadFromUrl(value);
			}
		});
	}

window.addEventListener('DOMContentLoaded', function() {

	var elem = document.body;
		elem.addEventListener("dragover", onDragOver);
	elem.addEventListener("dragenter", onDragEnter);
	elem.addEventListener("dragleave", onDragLeave);
		elem.addEventListener("drop", onDrop);

	MSXPlayUI.install(document.body);
	createAceEditor();

	if(localStorage.getItem(AUTOBACKUP_KEY)) {
		restoreFromLocalStorage();
	} else {
		selectSample();
	}

	document.getElementById('open-file').addEventListener('change',openFile);

	var mbox = document.getElementById('message');
	mbox.addEventListener('click',function(e) {				
		if(mbox.classList.contains('minimized')) {
			mbox.classList.remove('minimized');
		} else {
			if(e.target == document.querySelector('#message .title')) {
				mbox.classList.add('minimized');
			}
		}
	},true);

});