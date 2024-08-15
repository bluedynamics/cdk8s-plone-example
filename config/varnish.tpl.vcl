vcl 4.0;

import std;
import directors;

probe ploneBackendProbe {
    .url = "/ok";
    .timeout = 5s;
    .interval = 15s;
    .window = 10;
    .threshold = 8;
    # .initial = 3;
}
backend ploneBackend {
    .host = "{{ .Env.BACKEND_SERVICE_NAME }}";
    .port = "{{ .Env.BACKEND_SERVICE_PORT }}";
    .probe = ploneBackendProbe;
    .connect_timeout = 0.5s;
    .first_byte_timeout = 120s;
    .between_bytes_timeout = 60s;
}

probe ploneFrontendProbe {
    .url = "/ok";
    .timeout = 5s;
    .interval = 15s;
    .window = 10;
    .threshold = 8;
    # .initial = 3;
}
backend ploneFrontend {
    .host = "{{ .Env.FRONTEND_SERVICE_NAME }}";
    .port = "{{ .Env.FRONTEND_SERVICE_PORT }}";
    .probe = ploneFrontendProbe;
    .connect_timeout = 0.5s;
    .first_byte_timeout = 120s;
    .between_bytes_timeout = 60s;
}

/* Only allow PURGE from kubernetes network */
acl purge {
  "10.0.0.0/8";
}

sub detect_debug{
  # Requests with X-Varnish-Debug will display additional
  # information about requests
  unset req.http.x-vcl-debug;
  # Should be changed after switch to live
  #if (req.http.x-varnish-debug) {
  #    set req.http.x-vcl-debug = false;
  #}
  set req.http.x-vcl-debug = true;
}

sub detect_auth{
  unset req.http.x-auth;
  if (
      (req.http.Cookie && (
        req.http.Cookie ~ "__ac(_(name|password|persistent))?=" || req.http.Cookie ~ "_ZopeId" || req.http.Cookie ~ "auth_token")) ||
      (req.http.Authenticate) ||
      (req.http.Authorization)
  ) {
    set req.http.x-auth = true;
  }
}

sub detect_requesttype{
  unset req.http.x-varnish-reqtype;
  set req.http.x-varnish-reqtype = "Default";
  if (req.http.x-auth){
    set req.http.x-varnish-reqtype = "auth";
  } elseif (req.url ~ "\/@@(images|download|)\/?(.*)?$"){
    set req.http.x-varnish-reqtype = "blob";
  } elseif (req.url ~ "\/\+\+api\+\+/?(.*)?$") {
    set req.http.x-varnish-reqtype = "api";
  } else {
    set req.http.x-varnish-reqtype = "express";
  }
}

sub process_redirects{
  if (req.http.x-redirect-to) {
    return (synth(301, req.http.x-redirect-to));
  }
}

sub vcl_init {
  new lbPloneBackend = directors.round_robin();
  lbPloneBackend.add_backend(ploneBackend);

  new lbPloneFrontend = directors.round_robin();
  lbPloneFrontend.add_backend(ploneFrontend);
}

sub vcl_recv {
  # Annotate request with x-vcl-debug
  call detect_debug;

  # Annotate request with x-auth indicating if request is authenticated or not
  call detect_auth;

  # Annotate request with x-varnish-reqtype with a classification for the request
  call detect_requesttype;

  # Process redirects
  call process_redirects;

  # Routing: set the current Varnish backend to the matching Plone backend
  # Attention:
  # Confusing wording, we have two possible Varnish backends: the Plone frontend and the Plone backend *sigh*
  if ((req.url ~ "^/\+\+api\+\+") || (req.http.x-varnish-reqtype ~ "blob")) {
    set req.http.x-vcl-plone = "Backend";
    set req.backend_hint = lbPloneBackend.backend();
    # here we need a rewrite to add the virtualhost part of the URL for the Plone Backend
    set req.http.x-vcl-proto = "http";
    if (req.http.X-Forwarded-Proto) {
      set req.http.x-vcl-proto = req.http.X-Forwarded-Proto;
    }
    set req.url = "/VirtualHostBase/" + req.http.x-vcl-proto + "/" + req.http.host + "/Plone/VirtualHostRoot" + req.url;
  } else {
    set req.http.x-vcl-plone = "Frontend";
    set req.backend_hint = lbPloneFrontend.backend();
  }

  # short cut authenticated requests to pass
  if (req.http.x-auth) {
    return(pass);
  }

  # Sanitize cookies so they do not needlessly destroy cacheability for anonymous pages
  if (req.http.Cookie) {
    set req.http.Cookie = ";" + req.http.Cookie;
    set req.http.Cookie = regsuball(req.http.Cookie, "; +", ";");
    set req.http.Cookie = regsuball(req.http.Cookie, ";(sticky|I18N_LANGUAGE|statusmessages|__ac|_ZopeId|__cp|beaker\.session|authomatic|serverid|__rf|auth_token)=", "; \1=");
    set req.http.Cookie = regsuball(req.http.Cookie, ";[^ ][^;]*", "");
    set req.http.Cookie = regsuball(req.http.Cookie, "^[; ]+|[; ]+$", "");

    if (req.http.Cookie == "") {
        unset req.http.Cookie;
    }
  }

  # Handle the different request types
  if (req.method == "PURGE") {
      if (!client.ip ~ purge) {
          return (synth(405, "Not allowed."));
      } else {
          ban("req.url == " + req.url);
          return (synth(200, "Purged."));
      }

  } elseif (req.method == "BAN") {
      # Same ACL check as above:
      if (!client.ip ~ purge) {
          return (synth(405, "Not allowed."));
      }
      ban("req.http.host == " + req.http.host + "&& req.url == " + req.url);
      # Throw a synthetic page so the
      # request won't go to the backend.
      return (synth(200, "Ban added"));

  } elseif (req.method != "GET" &&
      req.method != "HEAD" &&
      req.method != "PUT" &&
      req.method != "POST" &&
      req.method != "PATCH" &&
      req.method != "TRACE" &&
      req.method != "OPTIONS" &&
      req.method != "DELETE") {
      /* Non-RFC2616 or CONNECT which is weird. */
      return (pipe);
  } elseif (req.method != "GET" &&
      req.method != "HEAD" &&
      req.method != "OPTIONS") {
      /* POST, PUT, PATCH will pass, always */
      return(pass);
  }

  return(hash);
}

sub vcl_pipe {
  /* This is not necessary if you do not do any request rewriting. */
  set req.http.connection = "close";
}

sub vcl_purge {
  return (synth(200, "PURGE: " + req.url + " - " + req.hash));
}

sub vcl_synth {
  if (resp.status == 301) {
    set resp.http.location = resp.reason;
    set resp.reason = "Moved";
    return (deliver);
  }
}

sub vcl_hit {
  if (obj.ttl >= 0s) {
    // A pure unadulterated hit, deliver it
    return (deliver);
  } elsif (obj.ttl + obj.grace > 0s) {
    // Object is in grace, deliver it
    // Automatically triggers a background fetch
    return (deliver);
  } else {
    return (restart);
  }
}


sub vcl_backend_response {
  # Annotate request with info about the backend used
  set beresp.http.x-varnish-plone-part = bereq.http.x-vcl-plone;
  # set beresp.http.x-varnish-plone-proto = bereq.http.x-vcl-proto;
  # set beresp.http.x-varnish-plone-host = bereq.http.x-vcl-host;
  # Don't allow static files to set cookies.
  # (?i) denotes case insensitive in PCRE (perl compatible regular expressions).
  # make sure you edit both and keep them equal.
  if (bereq.url ~ "(?i)\.(pdf|asc|dat|txt|doc|xls|ppt|tgz|png|gif|jpeg|jpg|ico|swf|css|js)(\?.*)?$") {
    unset beresp.http.set-cookie;
  }
  if (beresp.http.Set-Cookie) {
    set beresp.http.x-varnish-action = "FETCH (pass - response sets cookie)";
    set beresp.uncacheable = true;
    set beresp.ttl = 120s;
    return(deliver);
  }
  if (beresp.http.Cache-Control ~ "(private|no-cache|no-store)") {
    set beresp.http.x-varnish-action = "FETCH (pass - cache control disallows)";
    set beresp.uncacheable = true;
    set beresp.ttl = 120s;
    return(deliver);
  }

  # if (beresp.http.Authorization && !beresp.http.Cache-Control ~ "public") {
  # Do NOT cache if there is an "Authorization" header
  # beresp never has an Authorization header in beresp, right?
  if (beresp.http.Authorization) {
    set beresp.http.x-varnish-action = "FETCH (pass - authorized and no public cache control)";
    set beresp.uncacheable = true;
    set beresp.ttl = 120s;
    return(deliver);
  }

  # Use this rule IF no cache-control (SSR content)
  if ((bereq.http.x-varnish-reqtype ~ "express") && (!beresp.http.Cache-Control)) {
    set beresp.http.x-varnish-action = "INSERT (30s caching / 60s grace)";
    set beresp.uncacheable = false;
    set beresp.ttl = 30s;
    set beresp.grace = 60s;
    return(deliver);
  }

  if (!beresp.http.Cache-Control) {
    set beresp.http.x-varnish-action = "FETCH (override - backend not setting cache control)";
    set beresp.uncacheable = true;
    set beresp.ttl = 120s;
    return (deliver);
  }

  if (beresp.http.X-Anonymous && !beresp.http.Cache-Control) {
    set beresp.http.x-varnish-action = "FETCH (override - anonymous backend not setting cache control)";
    set beresp.ttl = 600s;
    return (deliver);
  }

  set beresp.http.x-varnish-action = "FETCH (insert)";
  return (deliver);
}

sub vcl_deliver {

  if (req.http.x-vcl-debug) {
    set resp.http.x-varnish-ttl = obj.ttl;
    set resp.http.x-varnish-grace = obj.grace;
    set resp.http.x-hits = obj.hits;
    set resp.http.x-varnish-reqtype = req.http.x-varnish-reqtype;
    if (req.http.x-auth) {
      set resp.http.x-auth = "Logged-in";
    } else {
      set resp.http.x-auth = "Anon";
    }
    if (obj.hits > 0) {
      set resp.http.x-cache = "HIT";
    } else {
      set resp.http.x-cache = "MISS";
    }
  } else {
    unset resp.http.x-varnish-action;
    unset resp.http.x-cache-operation;
    unset resp.http.x-cache-rule;
    unset resp.http.x-powered-by;
  }
}
