import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isCeremonialResolution} from '../src/lib/ceremonial-resolutions.js';

test('excludes verified ceremonial descriptions in both chambers',()=>{
  const records=[
    ['SR204','COMMENDATIONS','Commends Dr. Lawrence Dewayne Hardy for his exceptional leadership, guidance, and prayer during the 2026 Regular Session of the Louisiana Legislature.'],
    ['HR382','III COMMENDATIONS','Commends Pastor Joshua Joy Dara, Sr., on the occasion of the celebration of his thirtieth anniversary as pastor of Zion Hill Church'],
    ['HR203','CONDOLENCES','Expresses the condolences of the House of Representatives to the families of the children whose lives were taken in the mass shooting in Shreveport and affirms its stance against domestic violence'],
    ['HCR17','III CONDOLENCES','Expresses the condolences of the Legislature of Louisiana on the death of Dr. Joe S. Green, "The Bayou Bishop"'],
    ['SCR10','CONDOLENCES','To celebrate and honor the life of Dr. Norman C. Francis.'],
    ['SR152','CONDOLENCES','To express the sincere and heartfelt condolences to the family and friends of Susan Ann Traylor Bittick on the occasion of her passing.'],
    ['SR111','COMMENDATIONS',"Commends the volunteers and members of the 2026 Concerned Women for America's Encourage-A-Legislator Project."],
    ['HR113','COMMENDATIONS',"Commemorating the Martha's Vineyard African-American Film Festival on the occasion of its twenty-fourth anniversary and its role in elevating Black excellence in film"],
    ['HR69','COMMENDATIONS','Designates Jeanerette as the French Bread Capital of Louisiana'],
    ['HR89','COMMENDATIONS',`Commends the "LIFTOff Louisiana" team for their role in developing a highly successful response to the Federal Aviation Administration's request for proposals for the Electric Vertical Takeoff and Landing and Advanced Air Mobility Aircraft Integration Pilot Program`],
    ['SCR25','COMMENDATIONS',"Commends and congratulates the LIFTOff Louisiana Team in developing a highly successful response to the Federal Aviation Administration's request for proposals for the Electric Vertical Takeoff and Landing and Advanced Air Mobility Aircraft Integration Pilot Program."],
    ['SCR67','COMMENDATIONS',"Proclaims May 5, 2026, as Chef John Folse Day and commends and congratulates him for his outstanding contributions to the culinary arts and for his role in promoting Louisiana's rich cultural heritage throughout the world."],
    ['HR393','COMMENDATIONS','Designates June 30, 2026, as Arthrogryposis Multiplex Congenita (AMC) Awareness Day at the state capitol and commends Paisley Grace Langton and others who face AMC'],
  ];
  for(const [instrument,subject,official_description] of records)assert.equal(isCeremonialResolution({instrument,subject,official_description}),true,instrument);
});

test('retains substantive or uncertain legislation even with ceremonial subject labels',()=>{
  const records=[
    ['SR196','BLIGHTED PROPERTY','Creates a statewide taskforce to study and make recommendations on implementing a comprehensive plan to address property blight within the state.'],
    ['HB1','COMMENDATIONS','Commends a person'],
    ['SR1','COMMENDATIONS','Commends a person and requests the department to study the issue'],
    ['HR1','CONDOLENCES','Expresses condolences and establishes a grant program'],
    ['HCR1','COMMENDATIONS','Designates a bridge in honor of a person'],
    ['SCR1','CONDOLENCES','Expresses condolences and urges the legislature to enact legislation'],
    ['SR2','COMMENDATIONS',''],
    ['SR3','COMMENDATIONS','Other language not clearly ceremonial'],
  ];
  for(const [instrument,subject,official_description] of records)assert.equal(isCeremonialResolution({instrument,subject,official_description}),false,instrument);
});
