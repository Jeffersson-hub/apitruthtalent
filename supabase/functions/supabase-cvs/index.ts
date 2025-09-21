// Supabase Edge Function: supabase-cvs
// Deploy this as an Edge Function. Route prefix: /supabase-cvs
// Environment variables available in Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
console.info('supabase-cvs function starting');
Deno.serve(async (req)=>{
  try {
    const url = new URL(req.url);
    // Expect path like /supabase-cvs/list
    const pathname = url.pathname;
    // Basic route handling
    if (!pathname.startsWith('/supabase-cvs')) {
      return new Response(JSON.stringify({
        error: 'not found'
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    // Simple routing: /supabase-cvs/list
    if (pathname === '/supabase-cvs/list') {
      // Optional protection: if SUPABASE_CVS_SECRET is set, require header x-supabase-cvs-secret
      const requiredSecret = Deno.env.get('SUPABASE_CVS_SECRET');
      if (requiredSecret) {
        const provided = req.headers.get('x-supabase-cvs-secret') || '';
        if (provided !== requiredSecret) {
          return new Response(JSON.stringify({
            error: 'unauthorized'
          }), {
            status: 401,
            headers: {
              'Content-Type': 'application/json'
            }
          });
        }
      }
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
      const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const BUCKET = url.searchParams.get('bucket') || 'truthtalent';
      const prefix = url.searchParams.get('prefix') || '';
      const signed = url.searchParams.get('signed') !== 'false'; // default true
      const expires = Number(url.searchParams.get('expires') || '600');
      const limit = Number(url.searchParams.get('limit') || '100');
      if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
        return new Response(JSON.stringify({
          error: 'server misconfiguration'
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json'
          }
        });
      }
      // Helper: list objects
      const listUrl = `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/list/${encodeURIComponent(BUCKET)}`;
      const listRes = await fetch(listUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
          prefix,
          limit
        })
      });
      if (!listRes.ok) {
        const text = await listRes.text().catch(()=>'');
        return new Response(JSON.stringify({
          error: 'failed to list objects',
          status: listRes.status,
          body: text
        }), {
          status: 502,
          headers: {
            'Content-Type': 'application/json'
          }
        });
      }
      const files = await listRes.json(); // array of { name, ... }
      if (!signed) {
        // Return public-style URLs (useful if bucket is public)
        const mapped = files.map((f)=>({
            name: f.name,
            url: `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${encodeURIComponent(BUCKET)}/${encodeURIComponent(f.name)}`
          }));
        return new Response(JSON.stringify(mapped), {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        });
      }
      // Generate signed URLs concurrently
      const signedPromises = files.map(async (f)=>{
        const signUrl = `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/sign/${encodeURIComponent(BUCKET)}/${encodeURIComponent(f.name)}?expires_in=${Number(expires)}`;
        const r = await fetch(signUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
          }
        });
        if (!r.ok) return {
          name: f.name,
          url: null,
          error: `sign failed ${r.status}`
        };
        const j = await r.json();
        return {
          name: f.name,
          url: j.signedURL || null
        };
      });
      const signedFiles = await Promise.all(signedPromises);
      return new Response(JSON.stringify(signedFiles), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    // Unknown route under /supabase-cvs
    return new Response(JSON.stringify({
      error: 'not found'
    }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({
      error: 'internal error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
});
