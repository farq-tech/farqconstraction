import UIKit
import WebKit
import Capacitor

/// Hosts the bundled iPhone screens (src/mobile). Pinch-zoom stays off so the
/// app never looks magnified; debug builds can scan pages for overflow.
class FarqViewController: CAPBridgeViewController {


    #if DEBUG
    private static let diagScript = """
    (function () {
      if (window.__farqDiag) return; window.__farqDiag = true;
      function desc(el) {
        var c = (typeof el.className === 'string' ? el.className : '').trim().split(/\\s+/).slice(0, 8).join('.');
        var t = (el.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
        return el.tagName.toLowerCase() + (c ? '.' + c : '') + ' «' + t + '»';
      }
      function clipped(el) {
        for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          var o = getComputedStyle(p).overflowX;
          if (o === 'hidden' || o === 'auto' || o === 'scroll' || o === 'clip') return true;
        }
        return false;
      }
      function scan(label) {
        var W = document.documentElement.clientWidth, out = [];
        document.querySelectorAll('body *').forEach(function (el) {
          var r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          if ((r.right > W + 1 || r.left < -1) && !clipped(el)) {
            var pr = el.parentElement && el.parentElement.getBoundingClientRect();
            var parentOver = pr && (pr.right > W + 1 || pr.left < -1) && !clipped(el.parentElement);
            if (!parentOver) out.push(Math.round(r.width) + 'px L' + Math.round(r.left) + ' R' + Math.round(r.right) + ' ' + desc(el));
          }
        });
        window.webkit.messageHandlers.farqDiag.postMessage('FARQDIAG ' + label + ' W=' + W + ' inner=' + window.innerWidth + ' scrollW=' + document.documentElement.scrollWidth + ' n=' + out.length + '\\n' + out.slice(0, 15).join('\\n'));
      }
      var i = 0;
      function step() {
        var btns = Array.prototype.slice.call(document.querySelectorAll('nav.fixed button'));
        var label = i === 0 ? 'start' : ((btns[i - 1] && btns[i - 1].innerText) || 'p' + i).replace(/\\s+/g, ' ');
        scan(label);
        if (i < btns.length) { btns[i].click(); i++; setTimeout(step, 4500); }
      }
      setTimeout(step, 1500);
    })();
    """
    #endif

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let webView = webView else { return }
        let controller = webView.configuration.userContentController
        webView.scrollView.minimumZoomScale = 1
        webView.scrollView.maximumZoomScale = 1
        webView.scrollView.bouncesZoom = false
        #if DEBUG
        if ProcessInfo.processInfo.environment["FARQ_DIAG"] == "1" {
            controller.add(DiagPrinter(), name: "farqDiag")
            DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak webView] in
                webView?.evaluateJavaScript(Self.diagScript, completionHandler: nil)
            }
        }
        #endif
    }
}

#if DEBUG
private final class DiagPrinter: NSObject, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        print(String(describing: message.body))
    }
}
#endif
