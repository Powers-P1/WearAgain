export function snapshot(name='ALPHA'){
 const now=Date.parse('2026-10-23T00:00:00Z'),item=(id,category,availability='ready')=>({id,name:id,detail:'Own garment',category,availability,photoId:null});
 return {version:1,profile:{id:name,name,style:name+' prefers beige and navy, no patterns.',memories:[{id:'preference1',kind:'preference',text:name+' avoids wool against skin.',updatedAt:new Date(now).toISOString()}]},wardrobe:[item('topA','tops'),item('topB','tops'),item('bottomA','bottoms'),item('shoeA','shoes'),item('washA','tops','in_wash')],wears:[{date:'2026-10-22',itemIds:['topA','bottomA','shoeA']}],savedLooks:[],trip:null,location:'',date:'2026-10-23',avatarId:'woman_neutral_01',allowRenders:false,scenario:null,catalogue:null};
}
