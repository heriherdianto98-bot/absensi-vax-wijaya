package com.heri.finance;

/**
 * HERI Android foundation — Phase 1
 * Hybrid WebView host for HERI/web with native bridges:
 * Speech, TTS, NFC detect, deep link / assistant query.
 *
 * Full Gradle/Capacitor sync is done on Owner machine with Android Studio.
 * This source is the contract + wiring so Phase 1 is not "HTML only".
 */
import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.nfc.NfcAdapter;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import java.util.Locale;

public class MainActivity extends AppCompatActivity implements TextToSpeech.OnInitListener {
    private WebView webView;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private static final int REQ_MIC = 42;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);

        webView.setWebViewClient(new WebViewClient());
        webView.addJavascriptInterface(new HeriBridge(), "HeriAndroid");

        tts = new TextToSpeech(this, this);
        ensureMicPermission();

        // Bundled web assets expected at file:///android_asset/public/index.html
        // (Capacitor copies HERI/web → android assets)
        webView.loadUrl("file:///android_asset/public/index.html");

        handleIncomingIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        String q = null;
        if (data != null) {
            // heri://query?q=...  or https://heri.app/query?q=...
            q = data.getQueryParameter("q");
            if (q == null) q = data.getQueryParameter("query");
        }
        if (q == null && intent.hasExtra("q")) {
            q = intent.getStringExtra("q");
        }
        if (q != null) {
            final String query = q.replace("\\", "\\\\").replace("'", "\\'");
            webView.post(() -> webView.evaluateJavascript(
                "window.HERI_handleAssistantQuery && window.HERI_handleAssistantQuery('" + query + "')",
                null
            ));
        }
    }

    private void ensureMicPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
        }
    }

    @Override
    public void onInit(int status) {
        ttsReady = status == TextToSpeech.SUCCESS;
        if (ttsReady) {
            tts.setLanguage(new Locale("id", "ID"));
        }
    }

    @Override
    protected void onDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        super.onDestroy();
    }

    public class HeriBridge {
        @JavascriptInterface
        public void speak(String text) {
            if (!ttsReady || text == null || text.isEmpty()) return;
            runOnUiThread(() -> tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "heri-tts"));
        }

        @JavascriptInterface
        public boolean nfcAvailable() {
            NfcAdapter adapter = NfcAdapter.getDefaultAdapter(MainActivity.this);
            return adapter != null && adapter.isEnabled();
        }

        @JavascriptInterface
        public boolean hasMicPermission() {
            return ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
                    == PackageManager.PERMISSION_GRANTED;
        }

        @JavascriptInterface
        public String platform() {
            return "android";
        }
    }
}
