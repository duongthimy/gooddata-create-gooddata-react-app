const proxy = require("http-proxy-middleware");

const constants = require("./constants");

const domain = constants.backend;
module.exports = function(app) {
    app.use(
        proxy("/gdc", {
            changeOrigin: true,
            cookieDomainRewrite: "localhost",
            secure: false,
            target: domain,
            headers: {
                host: domain.replace(/https:\/\//, ''),
                origin: null,
                // This is essential for Tiger backends. To ensure 401 flies when not authenticated and using proxy
                "X-Requested-With": "XMLHttpRequest",
            },
            onProxyReq: function(proxyReq, req, res) {
                proxyReq.setHeader("accept-encoding", "identity");
            },
        }),
    );
    app.use(
        proxy("/*.html", {
            changeOrigin: true,
            secure: false,
            target: domain,
        }),
    );
    app.use(
        proxy("/packages/*.{js,css}", {
            changeOrigin: true,
            secure: false,
            target: domain,
        }),
    );
};
