package com.vinlancord.app;

import android.net.http.SslError;
import android.os.Bundle;
import android.webkit.SslErrorHandler;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PinsPlugin.class);
        super.onCreate(savedInstanceState);
        // Servidores só com IP usam certificado próprio: aceita APENAS o certificado
        // cuja impressão SHA-256 veio no link de convite (pinning). Qualquer outro erro é recusado.
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                if (PinsPlugin.isTrusted(getApplicationContext(), error)) handler.proceed();
                else handler.cancel();
            }
        });
    }
}
