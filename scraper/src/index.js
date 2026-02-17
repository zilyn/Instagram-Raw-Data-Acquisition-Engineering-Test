const { program } = require('commander');
const { createSession, fetchProfile, fetchAllPosts } = require('./instagram');
const { saveJSON } = require('./utils');

program
  .name('instagram-scraper')
  .description('HTTP-based Instagram public data scraper with full pagination')
  .requiredOption('-u, --username <username>', 'Instagram username to scrape')
  .option('-o, --output <file>', 'Output JSON file path (default: stdout)')
  .option('-m, --max-posts <number>', 'Maximum posts to fetch (0 = all)', '0')
  .option('--session-id <id>', 'Instagram sessionid cookie from browser (required for reliable access)')
  .parse();

const opts = program.opts();

async function main() {
  const { username, output, sessionId } = opts;
  const maxPosts = parseInt(opts.maxPosts, 10);

  console.log(`\n🔍 Instagram Scraper`);
  console.log(`   Target: @${username}`);
  console.log(`   Max posts: ${maxPosts === 0 ? 'all' : maxPosts}`);
  if (sessionId) console.log(`   Auth: Using provided session cookie`);
  console.log('');

  // Step 1: Create session
  console.log('→ Establishing session...');
  const session = await createSession(sessionId);
  console.log(`  ✓ Session established${session.authenticated ? ' (authenticated)' : ''}\n`);

  // Step 2: Fetch profile
  console.log(`→ Fetching profile for @${username}...`);
  const profile = await fetchProfile(username, session);
  console.log(`  ✓ Profile loaded: ${profile.full_name || username}`);
  console.log(`    Followers: ${profile.follower_count.toLocaleString()}`);
  console.log(`    Posts: ${profile.media_count.toLocaleString()}`);

  if (profile.is_private) {
    console.log('\n  ✗ This account is private. Cannot fetch posts.');
    const result = { profile, posts: [], scrape_metadata: buildMetadata(username, 0) };
    outputResult(result, output);
    return;
  }
  console.log('');

  // Step 3: Fetch posts with pagination
  const targetCount = maxPosts > 0 ? Math.min(maxPosts, profile.media_count) : profile.media_count;
  console.log(`→ Fetching posts (target: ${targetCount})...`);

  const posts = await fetchAllPosts(profile.user_id, session, maxPosts, (fetched) => {
    const pct = Math.round((fetched / targetCount) * 100);
    process.stdout.write(`\r  ↳ Progress: ${fetched} posts fetched (${Math.min(pct, 100)}%)`);
  });

  console.log(`\n  ✓ Fetched ${posts.length} posts\n`);

  // Step 4: Build and output result
  const result = {
    profile,
    posts,
    scrape_metadata: buildMetadata(username, posts.length),
  };

  outputResult(result, output);
}

function buildMetadata(username, postCount) {
  return {
    scraped_at: new Date().toISOString(),
    target_username: username,
    total_posts_fetched: postCount,
    scraper_version: '1.0.0',
  };
}

function outputResult(result, outputPath) {
  if (outputPath) {
    saveJSON(result, outputPath);
    console.log(`✓ Results saved to ${outputPath}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch((error) => {
  const status = error.response?.status;
  if (status === 404) {
    console.error(`\n✗ Error: User not found. Check the username and try again.`);
  } else if (status === 429) {
    console.error(`\n✗ Error: Rate limited by Instagram. Wait a few minutes and try again.`);
  } else if (status === 401 || status === 403) {
    console.error(`\n✗ Error: Access denied. Instagram may have blocked this request.`);
  } else {
    console.error(`\n✗ Error: ${error.message}`);
  }
  process.exit(1);
});
