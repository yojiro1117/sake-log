package jp.yojiro.sakelog;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SakeVisionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
