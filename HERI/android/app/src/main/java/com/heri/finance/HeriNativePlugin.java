package com.heri.finance;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.nfc.NfcAdapter;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Locale;

@CapacitorPlugin(name = "HeriNative")
public class HeriNativePlugin extends Plugin implements TextToSpeech.OnInitListener {
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private SpeechRecognizer recognizer;
    private PluginCall pendingSpeechCall;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), this);
    }

    @Override
    public void onInit(int status) {
        ttsReady = status == TextToSpeech.SUCCESS;
        if (ttsReady) {
            tts.setLanguage(new Locale("id", "ID"));
        }
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        if (text == null || text.isEmpty()) {
            call.reject("text required");
            return;
        }
        if (!ttsReady) {
            call.reject("TTS not ready");
            return;
        }
        getActivity().runOnUiThread(() -> {
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "heri-tts");
            call.resolve();
        });
    }

    @PluginMethod
    public void nfcAvailable(PluginCall call) {
        NfcAdapter adapter = NfcAdapter.getDefaultAdapter(getContext());
        JSObject ret = new JSObject();
        boolean ok = adapter != null && adapter.isEnabled();
        ret.put("available", ok);
        call.resolve(ret);
    }

    @PluginMethod
    public void ensureMicPermission(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        ActivityCompat.requestPermissions(
                getActivity(),
                new String[]{Manifest.permission.RECORD_AUDIO},
                4201
        );
        JSObject ret = new JSObject();
        ret.put("granted", false);
        ret.put("requested", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void startSpeech(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    getActivity(),
                    new String[]{Manifest.permission.RECORD_AUDIO},
                    4201
            );
            call.reject("RECORD_AUDIO permission required");
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("Speech recognition not available on this device");
            return;
        }

        pendingSpeechCall = call;
        getActivity().runOnUiThread(() -> {
            if (recognizer != null) {
                recognizer.destroy();
            }
            recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) {}
                @Override public void onBeginningOfSpeech() {}
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() {}
                @Override public void onEvent(int eventType, Bundle params) {}

                @Override
                public void onError(int error) {
                    if (pendingSpeechCall != null) {
                        pendingSpeechCall.reject("speech error code " + error);
                        pendingSpeechCall = null;
                    }
                }

                @Override
                public void onPartialResults(Bundle partialResults) {}

                @Override
                public void onResults(Bundle results) {
                    ArrayList<String> texts =
                            results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    String transcript = (texts != null && !texts.isEmpty()) ? texts.get(0) : "";
                    if (pendingSpeechCall != null) {
                        JSObject ret = new JSObject();
                        ret.put("transcript", transcript);
                        pendingSpeechCall.resolve(ret);
                        pendingSpeechCall = null;
                    }
                }
            });

            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "id-ID");
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            recognizer.startListening(intent);
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        if (recognizer != null) {
            recognizer.destroy();
        }
        super.handleOnDestroy();
    }
}
