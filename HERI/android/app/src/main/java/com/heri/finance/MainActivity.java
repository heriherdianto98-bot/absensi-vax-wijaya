package com.heri.finance;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HeriNativePlugin.class);
        super.onCreate(savedInstanceState);
        handleDeepLink(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLink(intent);
    }

    private void handleDeepLink(Intent intent) {
        if (intent == null || getBridge() == null) return;
        Uri data = intent.getData();
        String q = null;
        if (data != null) {
            q = data.getQueryParameter("q");
            if (q == null) q = data.getQueryParameter("query");
        }
        if (q == null && intent.hasExtra("q")) {
            q = intent.getStringExtra("q");
        }
        if (q == null || q.isEmpty()) return;

        final String safe = q
                .replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\n", " ");
        getBridge().getWebView().postDelayed(() ->
                getBridge().getWebView().evaluateJavascript(
                        "window.HERI_handleAssistantQuery && window.HERI_handleAssistantQuery('" + safe + "')",
                        null
                ), 600);
    }
}
