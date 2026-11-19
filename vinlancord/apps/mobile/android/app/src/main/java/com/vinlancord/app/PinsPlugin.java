package com.vinlancord.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.net.http.SslCertificate;
import android.net.http.SslError;
import android.os.Bundle;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.MessageDigest;

/** Guarda as impressões digitais (SHA-256) dos certificados de servidores aceitos pelo usuário. */
@CapacitorPlugin(name = "VlPins")
public class PinsPlugin extends Plugin {
    private static final String PREFS = "vl_pins";

    @PluginMethod
    public void trust(PluginCall call) {
        String host = call.getString("host", "");
        String pin = call.getString("pin", "");
        if (host.isEmpty() || !pin.matches("^[0-9a-fA-F]{64}$")) {
            call.reject("Servidor ou impressão digital inválidos.");
            return;
        }
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(host.toLowerCase(), pin.toLowerCase()).apply();
        call.resolve();
    }

    static boolean isTrusted(Context ctx, SslError error) {
        try {
            String host = Uri.parse(error.getUrl()).getHost();
            if (host == null) return false;
            String pin = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(host.toLowerCase(), null);
            if (pin == null) return false;
            SslCertificate cert = error.getCertificate();
            Bundle state = SslCertificate.saveState(cert);
            byte[] der = state.getByteArray("x509-certificate");
            if (der == null) return false;
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(der);
            StringBuilder hex = new StringBuilder();
            for (byte b : digest) hex.append(String.format("%02x", b));
            return hex.toString().equals(pin);
        } catch (Exception e) {
            return false;
        }
    }
}
