# Interview Transcript: Elena Vasquez, CEO & Co-Founder of Meridian Solar

**Date**: December 10, 2025
**Location**: Meridian Solar offices, Austin, TX
**Interviewer**: James Chen, Partner at Redpoint Capital Partners
**Duration**: 62 minutes
**Format**: In-person, recorded with consent
**Transcription**: Automated (Otter.ai), reviewed and corrected by Redpoint Capital analyst team

---

**James Chen**: Elena, thank you for taking the time to sit down with us. Before we get into the business, can you walk me through your background and how you came to start Meridian Solar?

**Elena Vasquez**: Sure, and thanks for making the trip to Austin. So my background is at the intersection of energy and software. I studied electrical engineering at Stanford, then did my PhD at MIT in photovoltaic systems. After that, I spent six years at SunPower in their R&D group, where I led the team that developed their Gen 5 residential monitoring system. That was really where I saw the gap in the market. We were building incredible hardware, but the software to manage distributed solar fleets was stuck in the 2010s. Basic dashboards, no predictive capabilities, no real intelligence.

**James Chen**: And that gap is what led to Meridian?

**Elena Vasquez**: Exactly. I left SunPower in 2022 and recruited Marcus Reed, my co-founder. Marcus comes from a pure software background. He was a senior engineering manager at Palantir for seven years, leading their commercial analytics platform. Between my deep domain expertise in solar and his platform engineering experience, we felt we had a unique combination to build something new.

**James Chen**: Can you describe the core product and what makes it different?

**Elena Vasquez**: SolarOS is an AI-powered fleet management platform for solar operators. If you're managing 50 megawatts or 500 megawatts of distributed solar assets, you need to know what's happening across thousands of individual systems in real time. You need to predict failures before they happen. You need to optimize energy production. And you need to manage the complexity of different hardware vendors, different inverters, different configurations.

What makes us different is the AI layer. We've built proprietary machine learning models that are trained on over 4.2 terabytes of real-world solar performance data. Our models can predict inverter failures up to 14 days in advance with 91% accuracy. We can identify underperforming panels and diagnose the cause — whether it's soiling, shading, degradation, or a wiring issue — from production data alone, without sending someone to the site.

**James Chen**: That 91% accuracy figure on failure prediction — how was that validated?

**Elena Vasquez**: We published a peer-reviewed paper on that in the IEEE Transactions on Sustainable Energy last year. The validation was done on a holdout dataset of 12,000 inverter events across 340 sites over an 18-month period. The 91% figure is precision at the 14-day horizon. At 7 days, we're at 96%. At 3 days, it's 99%. We're proud of that work and it's been a huge differentiator in sales conversations.

**James Chen**: Let's talk about the team. You mentioned Marcus. Who else is on the leadership team?

**Elena Vasquez**: We have a strong team. Marcus runs engineering. We have Sarah Kim as our VP of Sales — she joined us from Salesforce about 18 months ago and has been transformative. She rebuilt our entire go-to-market motion. Before Sarah, we were doing a lot of founder-led sales. She professionalized everything — the pipeline, the stages, the forecasting. Our close rates went from around 15% to 28% since she joined.

Then we have David Okafor as our VP of Customer Success. David came from Procore, where he built their CS org from 20 to 120 people. He's been critical in driving our net revenue retention from 119% to 128%.

On the product side, we have Dr. Anika Patel as our Head of Data Science. She was a research scientist at DeepMind before joining us. Anika's team is responsible for the core ML models that power our predictive capabilities.

**James Chen**: How about the broader team? What does the org look like?

**Elena Vasquez**: We're 74 people as of today. About 36 of those are in engineering and data science, which is intentional. We're a technology company first. We have 12 in sales, 9 in customer success, 6 in marketing, and the rest in G&A. We're planning to roughly double the go-to-market side of the house with the Series B capital.

**James Chen**: Let's talk about competitive dynamics. Who do you see as your main competitors?

**Elena Vasquez**: There are three categories I think about. The first is the legacy monitoring platforms — companies like Also Energy (which NEXTracker acquired), PowerTrack by Locus Energy, and Solar Analytics. These are good companies, but they're fundamentally monitoring tools. They tell you what happened yesterday. They don't tell you what's going to happen tomorrow. Their UIs are dated, their APIs are limited, and they haven't invested in ML in any meaningful way.

The second category is the large enterprise software companies that are trying to move into energy. Companies like Siemens with their MindSphere platform, or Schneider Electric with EcoStruxure. These are massive companies with big brands, but energy management is one of a hundred things they do. They don't have the focus or the domain-specific AI that we do. Every customer I've talked to who's evaluated both us and Siemens says the same thing: Siemens is broader but shallower.

The third category is the most interesting — the other AI-first startups. Raptor Solar is probably the closest competitor in terms of approach. They're focused more on utility-scale, whereas we started in distributed and are moving into utility-scale. SunCast AI does forecasting but doesn't do fleet management. GridBridge is doing virtual power plants, which is adjacent but not directly competitive.

**James Chen**: How do you win deals against Raptor specifically?

**Elena Vasquez**: Raptor is a good company. I respect what they're doing. We win on three things: first, our ML models are better for distributed solar. They trained primarily on utility-scale data. When you're managing thousands of residential or commercial systems, the failure modes and optimization opportunities are fundamentally different from a 200-megawatt solar farm. Second, our implementation times are much faster. We can get a customer live in 2-3 weeks for a standard deployment. Raptor, from what we hear, is more like 6-8 weeks. Third, and this matters a lot in the mid-market, our pricing is more accessible. We're about 30% less expensive than Raptor for comparable fleet sizes.

**James Chen**: You mentioned partnerships earlier. Can you elaborate on your partnership strategy?

**Elena Vasquez**: We have three significant partnerships I want to highlight. First, we have a data partnership with Enphase Energy. Enphase microinverters generate incredibly granular performance data — down to the individual panel level every 5 minutes. We have a preferred integration with Enphase's API that gives us access to this data stream for mutual customers. This partnership gives us a data advantage that's very hard for competitors to replicate because Enphase is selective about API access.

Second, we have a go-to-market partnership with Qcells. Qcells is one of the largest solar module manufacturers, and they have a growing installer network. We're being recommended by Qcells to their installers as the preferred fleet management platform. This is still early — we signed the partnership in September — but it's already generating qualified leads.

Third, and this one is still under NDA so I'd ask you to keep it confidential, we're in advanced discussions with a major U.S. utility about a pilot program to use SolarOS as the monitoring backbone for their community solar portfolio. If that goes through, it would be a seven-figure annual contract and a huge reference customer.

**James Chen**: That's exciting. Let me shift to the technology side. How defensible is your technology? What's the moat?

**Elena Vasquez**: The moat is multi-layered. The first layer is data. We've processed 4.2 terabytes of real-world solar performance data across more than 180,000 individual solar systems. Every new customer adds to our training data, which makes our models better, which makes the product better, which attracts more customers. It's a classic data flywheel.

The second layer is our proprietary models. We have three patents pending on our predictive maintenance algorithms. The core innovation is what we call "Contextual Degradation Modeling" — rather than treating each system in isolation, our models learn degradation patterns that account for geographic location, climate zone, hardware configuration, installation age, and operating conditions simultaneously. This approach was the subject of our IEEE paper.

The third layer is integrations. We support 47 inverter brands, 23 monitoring hardware platforms, and 12 weather data sources. Building and maintaining these integrations is unglamorous work, but it creates real switching costs. Once a customer has connected their entire fleet to SolarOS, migrating to a competitor means re-integrating everything.

**James Chen**: What's your biggest challenge right now?

**Elena Vasquez**: Honestly, it's scaling the sales organization without losing the consultative quality that wins us deals. Our product is technical. Our buyers are technical. A generic SaaS sales approach doesn't work. We need salespeople who understand solar operations, who can speak credibly about inverter failure modes and degradation curves. Finding those people is hard. Sarah has done an amazing job, but every hire takes time to ramp.

The second challenge is international expansion. We have a handful of customers in Europe and Australia, but we haven't invested in localization or local sales presence. The European market is huge — 21.7% of global solar market share — and I think there's a big opportunity there, but it requires dedicated investment that we haven't been able to make with our current resources.

**James Chen**: How do you think about the Series B and what it enables?

**Elena Vasquez**: The Series B is about going from a company with great technology and early traction to a company that can compete at scale. Specifically, three things:

First, we need to build out the sales and marketing engine. We want to go from 12 to 25 in sales, add a channel sales function, and invest in demand generation. Sarah has a detailed plan for this.

Second, we need to invest in the next generation of the product. The biggest opportunity I see is in forecasting — not just predicting failures, but predicting energy production with enough accuracy that our customers can participate in energy markets and demand response programs. That's a massive value unlock.

Third, we want to make a serious push into the enterprise segment. Our average enterprise contract is $465K, but I believe we can get that to $750K or more with the right product capabilities and the right enterprise sales team.

**James Chen**: If you look out three years, what does success look like?

**Elena Vasquez**: Three years from now, I want Meridian to be the default operating system for distributed solar. I want every C&I solar operator in North America to know our name and have us on their shortlist. I want to be at $65 million in revenue, profitable or very close to it, and I want to have expanded into Europe meaningfully.

But honestly, the vision is bigger than that. I believe solar is going to be the dominant energy source globally within 20 years. And the companies that build the intelligence layer on top of solar infrastructure — that's where the massive, enduring value will be created. That's what we're building.

**James Chen**: Last question. What would you want a potential investor to know that might not be obvious from the data?

**Elena Vasquez**: That our customers love us. And I don't say that lightly. Our NPS is 72, which in enterprise B2B is exceptional. When we lose a deal, it's almost never because the customer evaluated us and chose a competitor on merit. It's usually budget constraints or internal politics. When customers use the product, they stay. Our gross retention is over 91%, and most of that churn is customers going out of business, not switching to a competitor.

The other thing I'd want an investor to know is that Marcus and I are committed for the long haul. We're not looking for a quick flip. We've turned down two acquisition offers already — one from a large inverter manufacturer and one from a private equity firm. We believe this is a generational opportunity and we want to build a generational company.

**James Chen**: Elena, this has been incredibly helpful. Thank you for your candor and your time.

**Elena Vasquez**: Thank you, James. We're excited about the possibility of partnering with Redpoint.

---

*End of transcript.*
