import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ToolsRoom } from './tools-room';

describe('ToolsRoom', () => {
  let component: ToolsRoom;
  let fixture: ComponentFixture<ToolsRoom>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToolsRoom],
    }).compileComponents();

    fixture = TestBed.createComponent(ToolsRoom);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
